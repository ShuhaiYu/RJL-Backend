/**
 * Data Import Service
 *
 * Business logic for CSV data import.
 * Optimized for batch operations to handle large datasets within serverless timeouts.
 */

const csvParser = require('csv-parser');
const { Readable } = require('stream');
const prisma = require('../config/prisma');
const logger = require('../lib/logger');
const { AppError } = require('../lib/errors');
const { TASK_STATUS } = require('../config/constants');

/**
 * Detect task types from description
 * @param {string} description - Description from CSV
 * @returns {Object} { hasGasElec, hasSmokeAlarm, hasSafetyCheck }
 */
function detectTaskTypes(description) {
  if (!description) return { hasGasElec: false, hasSmokeAlarm: false, hasSafetyCheck: false };

  const lower = description.toLowerCase();
  return {
    hasGasElec: lower.includes('gas') || lower.includes('electric'),
    hasSmokeAlarm: lower.includes('smoke') || lower.includes('alarm'),
    hasSafetyCheck: lower.includes('safety check'),
  };
}

/**
 * Map region string from CSV to standardized region
 */
function mapRegion(regionStr) {
  if (!regionStr) return null;
  const upper = regionStr.toUpperCase().trim();

  if (upper.includes('EAST')) return 'EAST';
  if (upper.includes('WEST')) return 'WEST';
  if (upper.includes('NORTH')) return 'NORTH';
  if (upper.includes('SOUTH')) return 'SOUTH';
  if (upper.includes('CENTRAL')) return 'CENTRAL';

  return null;
}

/**
 * Parse Schedule field to extract inspection datetime
 * Format: "Ray - 2025-12-18 18:16" or "Ray - 2025-11-07 12:00 to 2025-11-07 16:00"
 * @param {string} scheduleStr - Schedule string from CSV
 * @returns {Date|null} Parsed inspection date or null
 */
function parseSchedule(scheduleStr) {
  if (!scheduleStr) return null;

  // Match YYYY-MM-DD HH:MM pattern (first occurrence)
  const match = scheduleStr.match(/(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/);
  if (match) {
    const dateTimeStr = `${match[1]}T${match[2]}:00`;
    const date = new Date(dateTimeStr);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }

  return null;
}

/**
 * Parse date from DD/MM/YYYY format
 */
function parseDate(dateStr) {
  if (!dateStr) return null;

  // Try DD/MM/YYYY format
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // JS months are 0-indexed
    const year = parseInt(parts[2], 10);

    if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
      return new Date(year, month, day);
    }
  }

  // Try ISO format as fallback
  const isoDate = new Date(dateStr);
  if (!isNaN(isoDate.getTime())) {
    return isoDate;
  }

  return null;
}

/**
 * Parse CSV buffer into array of rows
 */
function parseCsvBuffer(buffer) {
  return new Promise((resolve, reject) => {
    const rows = [];
    const stream = Readable.from(buffer);

    stream
      .pipe(csvParser())
      .on('data', (row) => rows.push(row))
      .on('end', () => resolve(rows))
      .on('error', (err) => reject(err));
  });
}

/**
 * Import CSV data (optimized batch version)
 * @param {Buffer} csvBuffer - CSV file buffer
 * @param {Object} user - Authenticated user
 * @returns {Object} Import results
 */
async function importCsv(csvBuffer, user) {
  const results = {
    created: 0,
    skipped: 0,
    errors: [],
  };

  // Parse CSV
  let rows;
  try {
    rows = await parseCsvBuffer(csvBuffer);
  } catch (error) {
    logger.error('CSV parsing error', { error: error.message });
    throw new AppError('Failed to parse CSV file', 400);
  }

  if (rows.length === 0) {
    throw new AppError('CSV file is empty', 400);
  }

  logger.info(`Parsed ${rows.length} rows from CSV`);

  // ========== PHASE 1: Pre-fetch all required data in bulk ==========

  // 1a. Get all agencies
  const agencyNames = [...new Set(rows.map(row => row['Customer']).filter(Boolean))];
  if (agencyNames.length === 0) {
    throw new AppError('No valid Customer names found in CSV', 400);
  }

  const agencies = await prisma.agency.findMany({
    where: {
      agencyName: { in: agencyNames, mode: 'insensitive' },
      isActive: true,
    },
  });

  const agencyMap = new Map();
  agencies.forEach(agency => {
    agencyMap.set(agency.agencyName.toLowerCase(), agency);
  });

  // Check for missing agencies
  const missingAgencies = agencyNames.filter(name => !agencyMap.has(name.toLowerCase()));
  if (missingAgencies.length > 0) {
    throw new AppError(
      `Import cancelled: The following agencies do not exist: ${missingAgencies.join(', ')}`,
      400
    );
  }

  // 1b. Get all users for all agencies (single query)
  const agencyIds = agencies.map(a => a.id);
  const allUsers = agencyIds.length > 0
    ? await prisma.user.findMany({
        where: {
          agencyId: { in: agencyIds },
          isActive: true,
        },
      })
    : [];

  // Build agency -> user map (prioritizing agencyAdmin)
  const agencyUserMap = new Map();
  allUsers.forEach(user => {
    if (!agencyUserMap.has(user.agencyId)) {
      agencyUserMap.set(user.agencyId, []);
    }
    agencyUserMap.get(user.agencyId).push(user);
  });

  // Sort each agency's users by priority
  agencyUserMap.forEach((users, agencyId) => {
    users.sort((a, b) => {
      const priority = { agencyAdmin: 1, agencyUser: 2, admin: 3, superuser: 4 };
      return (priority[a.role] || 99) - (priority[b.role] || 99);
    });
  });

  // 1c. Get all existing tasks with job numbers (single query for duplicate check)
  // Fetch all tasks with "[" in name and filter in memory (more efficient than OR with 1000+ conditions)
  const allJobNumbers = new Set(rows.map(row => row['Job Number']).filter(Boolean));
  const existingTasks = await prisma.task.findMany({
    where: {
      isActive: true,
      taskName: { contains: '[' },
    },
    select: { taskName: true },
  });

  const existingJobNumbers = new Set();
  existingTasks.forEach(task => {
    const match = task.taskName.match(/\[([^\]]+)\]/);
    if (match && allJobNumbers.has(match[1])) {
      existingJobNumbers.add(match[1]);
    }
  });

  // 1d. Get all existing properties (single query)
  const allAddresses = [...new Set(rows.map(row => row['Job Address']).filter(Boolean))];
  const existingProperties = allAddresses.length > 0
    ? await prisma.property.findMany({
        where: {
          address: { in: allAddresses },
          isActive: true,
        },
      })
    : [];

  // Build address+userId -> property map
  const propertyMap = new Map();
  existingProperties.forEach(prop => {
    propertyMap.set(`${prop.address}|${prop.userId}`, prop);
  });

  // 1e. Get all existing contacts (single query)
  const propertyIds = existingProperties.map(p => p.id);
  const existingContacts = propertyIds.length > 0
    ? await prisma.contact.findMany({
        where: {
          propertyId: { in: propertyIds },
          isActive: true,
        },
      })
    : [];

  // Build propertyId+name -> contact map
  const contactMap = new Set();
  existingContacts.forEach(contact => {
    contactMap.add(`${contact.propertyId}|${contact.name}`);
  });

  logger.info('Pre-fetch complete', {
    agencies: agencies.length,
    users: allUsers.length,
    existingTasks: existingTasks.length,
    existingProperties: existingProperties.length,
    existingContacts: existingContacts.length,
  });

  // ========== PHASE 2: Process rows and prepare batch data ==========

  const propertiesToCreate = [];
  const contactsToCreate = [];
  const tasksToCreate = [];

  // Track properties we're creating in this batch (to avoid duplicates within batch)
  const newPropertyKeys = new Map(); // address|userId -> temp index

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    try {
      const jobNumber = row['Job Number'];
      const customerName = row['Customer'];
      const address = row['Job Address'];
      const reference = row['Reference'];
      const jobType = row['Job Type'];
      const description = row['Description'];
      const contactName = row['Job Contact'];
      const contactPhone = row['Job Contact Phone'];
      const contactMobile = row['Job Contact Mobile'];
      const region = row['Job Region'];
      const status = row['Status'];
      const schedule = row['Schedule'];

      // Parse dates
      const inspectionDate = parseSchedule(schedule);
      const isCompleted = status?.toLowerCase() === 'complete';
      const taskStatus = isCompleted ? TASK_STATUS.COMPLETED : TASK_STATUS.UNKNOWN;
      const dueDate = parseDate(reference);

      // Validation
      if (isCompleted && !inspectionDate) {
        results.errors.push(`Row ${rowNum}: Status is Complete but Schedule is missing or invalid (skipped)`);
        results.skipped++;
        continue;
      }

      if (!jobNumber) {
        results.errors.push(`Row ${rowNum}: Missing Job Number (skipped)`);
        results.skipped++;
        continue;
      }

      if (!customerName) {
        results.errors.push(`Row ${rowNum}: Missing Customer (skipped)`);
        results.skipped++;
        continue;
      }

      if (!address) {
        results.errors.push(`Row ${rowNum}: Missing Job Address (skipped)`);
        results.skipped++;
        continue;
      }

      // Get agency
      const agency = agencyMap.get(customerName.toLowerCase());
      if (!agency) {
        results.errors.push(`Row ${rowNum}: Agency "${customerName}" not found (skipped)`);
        results.skipped++;
        continue;
      }

      // Check duplicate job number
      if (existingJobNumbers.has(jobNumber)) {
        results.errors.push(`Row ${rowNum}: Job Number ${jobNumber} already imported (skipped)`);
        results.skipped++;
        continue;
      }

      // Get agency user
      const agencyUsers = agencyUserMap.get(agency.id) || [];
      if (agencyUsers.length === 0) {
        results.errors.push(`Row ${rowNum}: No active users in agency "${customerName}" (skipped)`);
        results.skipped++;
        continue;
      }

      const assignedUser = agencyUsers[0];
      const propertyKey = `${address}|${assignedUser.id}`;

      // Check task types
      const { hasGasElec, hasSmokeAlarm, hasSafetyCheck } = detectTaskTypes(description);

      // Determine task types to create
      let taskTypes = [];
      if (hasGasElec && !hasSmokeAlarm) {
        taskTypes = ['GAS_&_ELECTRICITY'];
      } else if (!hasGasElec && hasSmokeAlarm) {
        taskTypes = ['SMOKE_ALARM'];
      } else if (hasGasElec && hasSmokeAlarm) {
        taskTypes = isCompleted ? ['GAS_&_ELECTRICITY', 'SMOKE_ALARM'] : ['SAFETY_CHECK'];
      } else if (hasSafetyCheck) {
        taskTypes = isCompleted ? ['GAS_&_ELECTRICITY', 'SMOKE_ALARM'] : ['SAFETY_CHECK'];
      } else {
        results.errors.push(`Row ${rowNum}: No valid task type detected in Description (skipped)`);
        results.skipped++;
        continue;
      }

      // Check/prepare property
      let propertyRef;
      if (propertyMap.has(propertyKey)) {
        propertyRef = { type: 'existing', property: propertyMap.get(propertyKey) };
      } else if (newPropertyKeys.has(propertyKey)) {
        propertyRef = { type: 'batch', index: newPropertyKeys.get(propertyKey) };
      } else {
        // Need to create property
        const newIndex = propertiesToCreate.length;
        propertiesToCreate.push({
          address: address,
          userId: assignedUser.id,
          region: mapRegion(region),
        });
        newPropertyKeys.set(propertyKey, newIndex);
        propertyRef = { type: 'batch', index: newIndex };
      }

      // Prepare contact if needed
      if (contactName && contactName.trim()) {
        const phone = contactMobile || contactPhone || null;
        contactsToCreate.push({
          propertyRef,
          name: contactName.trim(),
          phone,
        });
      }

      // Prepare tasks
      for (const type of taskTypes) {
        tasksToCreate.push({
          propertyRef,
          agencyId: agency.id,
          taskName: `[${jobNumber}] ${jobType || 'Safety Check'}`,
          taskDescription: description || null,
          dueDate,
          inspectionDate,
          type,
          status: taskStatus,
          repeatFrequency: 'none',
        });
      }

      // Mark job number as used (prevent duplicates within same import)
      existingJobNumbers.add(jobNumber);

    } catch (error) {
      logger.error(`Error processing row ${rowNum}`, { error: error.message });
      results.errors.push(`Row ${rowNum}: ${error.message}`);
      results.skipped++;
    }
  }

  logger.info('Batch preparation complete', {
    propertiesToCreate: propertiesToCreate.length,
    contactsToCreate: contactsToCreate.length,
    tasksToCreate: tasksToCreate.length,
  });

  // ========== PHASE 3: Create properties first (no transaction needed) ==========

  // Map to lookup created property IDs by address+userId key
  const createdPropertyLookup = new Map();

  if (propertiesToCreate.length > 0) {
    // Use PostgreSQL UNNEST for true bulk insert (single query, returns IDs)
    const addresses = propertiesToCreate.map(p => p.address);
    const userIds = propertiesToCreate.map(p => p.userId);
    const regions = propertiesToCreate.map(p => p.region);

    try {
      const createdProperties = await prisma.$queryRaw`
        INSERT INTO "Property" ("address", "userId", "region")
        SELECT * FROM UNNEST(
          ${addresses}::text[],
          ${userIds}::integer[],
          ${regions}::text[]
        )
        RETURNING "id", "address", "userId"
      `;

      createdProperties.forEach(prop => {
        // Convert BigInt to Number for consistent key matching
        const userId = Number(prop.userId);
        createdPropertyLookup.set(`${prop.address}|${userId}`, Number(prop.id));
      });
      logger.info(`Created ${createdProperties.length} properties via bulk insert`);
    } catch (bulkError) {
      // Fallback to batched creates if bulk insert fails
      logger.warn('Bulk insert failed, falling back to batched creates', { error: bulkError.message });

      const BATCH_SIZE = 50;
      for (let i = 0; i < propertiesToCreate.length; i += BATCH_SIZE) {
        const batch = propertiesToCreate.slice(i, i + BATCH_SIZE);
        const created = await Promise.all(
          batch.map(prop => prisma.property.create({ data: prop }))
        );
        created.forEach(prop => {
          // Prisma returns Numbers for non-raw queries, but be consistent
          createdPropertyLookup.set(`${prop.address}|${prop.userId}`, prop.id);
        });
      }
      logger.info(`Created ${createdPropertyLookup.size} properties via fallback`);
    }
  }

  // ========== PHASE 4: Create contacts and tasks in transaction ==========

  if (contactsToCreate.length > 0 || tasksToCreate.length > 0) {
    // Helper to resolve property ID from reference
    const resolvePropertyId = (propertyRef) => {
      if (propertyRef.type === 'existing') {
        return propertyRef.property.id;
      } else {
        // Look up by the original address+userId from propertiesToCreate
        const originalProp = propertiesToCreate[propertyRef.index];
        const key = `${originalProp.address}|${originalProp.userId}`;
        return createdPropertyLookup.get(key);
      }
    };

    // Resolve property references and prepare contact data
    const contactData = [];
    const contactKeys = new Set();

    for (const contact of contactsToCreate) {
      const propertyId = resolvePropertyId(contact.propertyRef);
      if (!propertyId) continue;

      const contactKey = `${propertyId}|${contact.name}`;
      if (!contactMap.has(contactKey) && !contactKeys.has(contactKey)) {
        contactData.push({
          name: contact.name,
          phone: contact.phone,
          propertyId,
        });
        contactKeys.add(contactKey);
      }
    }

    // Prepare task data
    const taskData = tasksToCreate.map(task => {
      const propertyId = resolvePropertyId(task.propertyRef);
      return {
        propertyId,
        agencyId: task.agencyId,
        taskName: task.taskName,
        taskDescription: task.taskDescription,
        dueDate: task.dueDate,
        inspectionDate: task.inspectionDate,
        type: task.type,
        status: task.status,
        repeatFrequency: task.repeatFrequency,
      };
    }).filter(t => t.propertyId); // Filter out any with missing propertyId

    // Create contacts and tasks in a quick transaction
    await prisma.$transaction(async (tx) => {
      if (contactData.length > 0) {
        await tx.contact.createMany({ data: contactData });
        logger.info(`Created ${contactData.length} contacts`);
      }

      if (taskData.length > 0) {
        await tx.task.createMany({ data: taskData });
        logger.info(`Created ${taskData.length} tasks`);
      }

      // Update created count after successful insertion
      results.created = taskData.length;
    }, { timeout: 15000 });
  }

  logger.info('Import completed', {
    created: results.created,
    skipped: results.skipped,
    errorCount: results.errors.length,
  });

  return results;
}

module.exports = {
  importCsv,
};

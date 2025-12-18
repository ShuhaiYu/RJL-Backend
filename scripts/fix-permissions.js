/**
 * Fix Permissions Script
 *
 * Run this script to refresh permissions for existing users.
 * Usage: node scripts/fix-permissions.js [userId]
 *
 * If no userId provided, refreshes permissions for all users.
 */

require('dotenv').config();
const prisma = require('../src/config/prisma');
const permissionRepository = require('../src/repositories/permissionRepository');

async function refreshUserPermissions(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    console.log(`User ${userId} not found`);
    return;
  }

  console.log(`Refreshing permissions for user ${userId} (${user.email}, role: ${user.role})`);

  // Remove existing permissions
  await permissionRepository.removeAllFromUser(userId);

  // Assign default permissions based on role
  await permissionRepository.assignDefaultPermissions(userId, user.role);

  // Verify
  const permissions = await permissionRepository.findByUserId(userId);
  const permMap = permissions.reduce((acc, p) => {
    if (!acc[p.permissionScope]) acc[p.permissionScope] = [];
    acc[p.permissionScope].push(p.permissionValue);
    return acc;
  }, {});

  console.log(`Assigned permissions:`, permMap);
}

async function refreshAllUsers() {
  const users = await prisma.user.findMany({ where: { isActive: true } });
  console.log(`Found ${users.length} active users`);

  for (const user of users) {
    await refreshUserPermissions(user.id);
  }
}

async function main() {
  try {
    const userId = process.argv[2];

    if (userId) {
      await refreshUserPermissions(parseInt(userId, 10));
    } else {
      await refreshAllUsers();
    }

    console.log('\nDone! Users need to re-login to get new JWT with updated permissions.');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();

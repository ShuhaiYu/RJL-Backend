/**
 * Script to add inspection permissions to existing admin/superuser users
 * Run with: node scripts/add-inspection-permissions.js
 */

const prisma = require('../src/config/prisma');

async function addInspectionPermissions() {
  console.log('Adding inspection permissions to existing users...');

  try {
    // 1. Create inspection permissions if they don't exist
    const permissionValues = ['create', 'read', 'update', 'delete'];
    const createdPermissions = [];

    for (const value of permissionValues) {
      const existing = await prisma.permission.findFirst({
        where: {
          permissionValue: value,
          permissionScope: 'inspection',
        },
      });

      if (!existing) {
        const perm = await prisma.permission.create({
          data: {
            permissionValue: value,
            permissionScope: 'inspection',
          },
        });
        console.log(`Created permission: ${value} - inspection`);
        createdPermissions.push(perm);
      } else {
        console.log(`Permission already exists: ${value} - inspection`);
        createdPermissions.push(existing);
      }
    }

    // 2. Find all admin and superuser users
    const adminUsers = await prisma.user.findMany({
      where: {
        role: { in: ['superuser', 'admin', 'agency-admin'] },
        isActive: true,
      },
    });

    console.log(`Found ${adminUsers.length} admin users`);

    // 3. Assign permissions to each user
    for (const user of adminUsers) {
      const permissionsToAssign = [];

      // All roles get read
      const readPerm = createdPermissions.find(p => p.permissionValue === 'read');
      if (readPerm) permissionsToAssign.push(readPerm.id);

      // Admin roles get create, update
      if (['superuser', 'admin', 'agency-admin'].includes(user.role)) {
        const createPerm = createdPermissions.find(p => p.permissionValue === 'create');
        const updatePerm = createdPermissions.find(p => p.permissionValue === 'update');
        if (createPerm) permissionsToAssign.push(createPerm.id);
        if (updatePerm) permissionsToAssign.push(updatePerm.id);
      }

      // Superuser gets delete
      if (user.role === 'superuser') {
        const deletePerm = createdPermissions.find(p => p.permissionValue === 'delete');
        if (deletePerm) permissionsToAssign.push(deletePerm.id);
      }

      // Assign permissions
      for (const permissionId of permissionsToAssign) {
        try {
          await prisma.userPermission.create({
            data: {
              userId: user.id,
              permissionId,
            },
          });
        } catch (e) {
          // Ignore duplicate errors
          if (!e.message.includes('Unique constraint')) {
            console.error(`Error assigning permission to user ${user.id}:`, e.message);
          }
        }
      }

      console.log(`Assigned inspection permissions to user: ${user.name} (${user.role})`);
    }

    console.log('Done!');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

addInspectionPermissions();

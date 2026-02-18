require("dotenv").config();
const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    throw new Error("Faltando ADMIN_EMAIL ou ADMIN_PASSWORD no .env");
  }

  const exists = await prisma.user.findUnique({ where: { email: adminEmail } });

  if (!exists) {
    const hash = await bcrypt.hash(adminPassword, 10);

    await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash: hash,
        role: "ADMIN",
        mustChangePassword: false,
      },
    });

    console.log("✅ Admin criado:", adminEmail);
  } else {
    console.log("ℹ️ Admin já existe:", adminEmail);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

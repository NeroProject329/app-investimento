const bcrypt = require("bcryptjs");
const { z } = require("zod");
const { prisma } = require("../lib/prisma");
const { signToken } = require("../lib/jwt");

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "Nova senha deve ter no mínimo 8 caracteres"),
});

function cookieOptions() {
  // Em dev/local: secure false funciona no http://localhost
  // Em produção (https): secure true
  const isProd = process.env.NODE_ENV === "production";

  return {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 dias
  };
}

async function login(req, res) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, message: "Dados inválidos", errors: parsed.error.flatten() });
  }

  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(401).json({ ok: false, message: "E-mail ou senha inválidos" });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ ok: false, message: "E-mail ou senha inválidos" });

  const token = signToken({ userId: user.id, role: user.role });

  res.cookie("token", token, cookieOptions());
  return res.json({
    ok: true,
    user: { id: user.id, email: user.email, role: user.role, mustChangePassword: user.mustChangePassword },
  });
}

async function me(req, res) {
  // requireAuth já colocou req.user
  // vamos trazer também o clientId se for CLIENT, pra facilitar o front depois
  const user = req.user;

  const client = user.role === "CLIENT"
    ? await prisma.client.findFirst({
        where: { userId: user.id },
        select: { id: true, fullName: true, profile: true },
      })
    : null;

  return res.json({ ok: true, user, client });
}

async function changePassword(req, res) {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, message: "Dados inválidos", errors: parsed.error.flatten() });
  }

  const { currentPassword, newPassword } = parsed.data;

  const dbUser = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!dbUser) return res.status(404).json({ ok: false, message: "Usuário não encontrado" });

  const ok = await bcrypt.compare(currentPassword, dbUser.passwordHash);
  if (!ok) return res.status(401).json({ ok: false, message: "Senha atual incorreta" });

  const newHash = await bcrypt.hash(newPassword, 10);

  await prisma.user.update({
    where: { id: dbUser.id },
    data: { passwordHash: newHash, mustChangePassword: false },
  });

  return res.json({ ok: true, message: "Senha atualizada com sucesso" });
}

async function logout(req, res) {
  res.clearCookie("token", { path: "/" });
  return res.json({ ok: true });
}

module.exports = { login, me, changePassword, logout };

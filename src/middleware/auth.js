const { verifyToken } = require("../lib/jwt");
const { prisma } = require("../lib/prisma");

async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.token;
    if (!token) return res.status(401).json({ ok: false, message: "Não autenticado" });

    const decoded = verifyToken(token);

    // Opcional (mas bom): buscar usuário no banco pra garantir que existe
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, role: true, mustChangePassword: true },
    });

    if (!user) return res.status(401).json({ ok: false, message: "Usuário não encontrado" });

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ ok: false, message: "Token inválido ou expirado" });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== "ADMIN") {
    return res.status(403).json({ ok: false, message: "Acesso negado (admin)" });
  }
  next();
}

module.exports = { requireAuth, requireAdmin };

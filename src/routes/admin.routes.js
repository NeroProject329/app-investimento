const router = require("express").Router();
const { requireAuth, requireAdmin } = require("../middleware/auth");

// clientes
const { createClient, listClients } = require("../controller/admin.clients.controller");

// sub-rotas
const groupsRoutes = require("./admin.groups.routes");
const investmentsRoutes = require("./admin.investments.routes");
const transactionsRoutes = require("./admin.transactions.routes");

router.use(requireAuth, requireAdmin);

router.get("/clients", listClients);
router.post("/clients", createClient);

// vertentes, investimentos, transações por cliente
router.use("/clients/:clientId/groups", groupsRoutes);
router.use("/clients/:clientId/investments", investmentsRoutes);
router.use("/clients/:clientId/transactions", transactionsRoutes);

module.exports = router;

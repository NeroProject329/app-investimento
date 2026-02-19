const router = require("express").Router();
const { requireAuth, requireAdmin } = require("../middleware/auth");
const { forceChangePassword } = require("../middleware/forceChangePassword");

// clientes
const { createClient, listClients } = require("../controller/admin.clients.controller");
const { getClientDashboard } = require("../controller/admin.dashboard.controller");

// sub-rotas
const groupsRoutes = require("./admin.groups.routes");
const investmentsRoutes = require("./admin.investments.routes");
const transactionsRoutes = require("./admin.transactions.routes");

router.use(requireAuth, requireAdmin, forceChangePassword);

router.get("/clients", listClients);
router.post("/clients", createClient);

router.get("/clients/:clientId/dashboard", getClientDashboard);

// vertentes, investimentos, transações por cliente
router.use("/clients/:clientId/groups", groupsRoutes);
router.use("/clients/:clientId/investments", investmentsRoutes);
router.use("/clients/:clientId/transactions", transactionsRoutes);

module.exports = router;

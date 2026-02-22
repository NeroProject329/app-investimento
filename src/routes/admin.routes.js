const router = require("express").Router();
const { requireAuth, requireAdmin } = require("../middleware/auth");
const { forceChangePassword } = require("../middleware/forceChangePassword");

// clientes
const { createClient, listClients } = require("../controller/admin.clients.controller");
const { getClientDashboard } = require("../controller/admin.dashboard.controller");
const { getMetrics } = require("../controller/admin.metrics.controller");


// sub-rotas
const groupsRoutes = require("./admin.groups.global.routes");
const investmentsRoutes = require("./admin.investments.routes");
const transactionsRoutes = require("./admin.transactions.routes");
const exportsRoutes = require("./admin.exports.routes");
const globalGroupsRoutes = require("./admin.groups.global.routes");
const adminGlobalTransactionsRoutes = require("./admin.transactions.global.routes");
const adminGlobalInvestmentsRoutes = require("./admin.investments.global.routes");


router.use(requireAuth, requireAdmin, forceChangePassword);
router.use("/transactions", adminGlobalTransactionsRoutes);
router.use("/investments", adminGlobalInvestmentsRoutes);
router.use("/clients/:clientId/exports", exportsRoutes);


router.get("/clients", listClients);
router.post("/clients", createClient);

router.get("/clients/:clientId/dashboard", getClientDashboard);

// vertentes, investimentos, transações por cliente
router.use("/groups", globalGroupsRoutes);
router.use("/clients/:clientId/groups", groupsRoutes);
router.use("/clients/:clientId/investments", investmentsRoutes);
router.use("/clients/:clientId/transactions", transactionsRoutes);

router.get("/metrics", getMetrics);

module.exports = router;

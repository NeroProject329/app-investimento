const router = require("express").Router();
const { requireAuth } = require("../middleware/auth");
const { forceChangePassword } = require("../middleware/forceChangePassword");

const { getMyDashboard } = require("../controller/client.dashboard.controller");
const { getMyTransactions } = require("../controller/client.transactions.controller");
const { listMyInvestments, listMyGroups } = require("../controller/client.meta.controller");

router.use(requireAuth, forceChangePassword);

router.get("/dashboard", getMyDashboard);
router.get("/transactions", getMyTransactions);

// parte 7: meta
router.get("/investments", listMyInvestments);
router.get("/groups", listMyGroups);

module.exports = router;

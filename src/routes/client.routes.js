const router = require("express").Router();
const { requireAuth } = require("../middleware/auth");
const { getMyDashboard } = require("../controller/client.dashboard.controller");
const { getMyTransactions } = require("../controller/client.transactions.controller");

router.use(requireAuth);

router.get("/dashboard", getMyDashboard);
router.get("/transactions", getMyTransactions);

module.exports = router;

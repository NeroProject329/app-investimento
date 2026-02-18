const router = require("express").Router();
const { createInvestment, listInvestments } = require("../controllers/admin.investments.controller");

router.get("/", listInvestments);
router.post("/", createInvestment);

module.exports = router;

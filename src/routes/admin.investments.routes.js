const express = require("express");
const router = express.Router({ mergeParams: true });

const { createInvestment, listInvestments } = require("../controller/admin.investments.controller");

router.get("/", listInvestments);
router.post("/", createInvestment);

module.exports = router;

const express = require("express");
const router = express.Router({ mergeParams: true });

const { createGroup, listGroups } = require("../controller/admin.groups.controller");

router.get("/", listGroups);
router.post("/", createGroup);

module.exports = router;

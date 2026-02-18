const router = require("express").Router();
const { createGroup, listGroups } = require("../controller/admin.groups.controller");

router.get("/", listGroups);
router.post("/", createGroup);

module.exports = router;

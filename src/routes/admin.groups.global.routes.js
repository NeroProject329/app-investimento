const router = require("express").Router();

const {
  listGroups,
  createGroup,
  updateGroup,
  deleteGroup,
} = require("../controller/admin.groups.controller");

router.get("/", listGroups);
router.post("/", createGroup);
router.patch("/:groupId", updateGroup);
router.delete("/:groupId", deleteGroup);

module.exports = router;
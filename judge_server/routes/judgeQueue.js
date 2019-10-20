const express = require('express');
const router = express.Router();

router.get('/', function(req, res, next) {
    console.log(req.app.get('judgeQueue'));
});

module.exports = router;
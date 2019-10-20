const express = require('express');
const router = express.Router();
const pushQueue = require('../pushQueue');

const bodyParser = require('body-parser');
const model = require('../model/model');

router.use(bodyParser.urlencoded({
    extended: false
}));

router.post('/', function(req, res, next) {
    const Queue = req.app.get('judgeQueue');
    model.judgeQueue.findOne()
        .where('pending_number').equals(req.body.pending_number)
        .then(result => {
            if(!result) throw new Error('none-pending');
            pushQueue(Queue, result);
            res.status(200).send('Success');
        }).catch(err => {
            console.log(err);
            res.status(500).send('fail');
    });
});

module.exports = router;
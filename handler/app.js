const mongoose = require('mongoose');
const config = require('./config.js');

/* ---------
 mongoose connected */

mongoose.connect(config.mongodbUri, {useUnifiedTopology: true, useNewUrlParser: true, useCreateIndex: true });
mongoose.Promise = global.Promise;

const db = mongoose.connection;
db.on('error', console.error);
db.once('open', ()=>{
    console.log('connected to mongodb server')
});

const model = require('./model/model');
const syncQueue = require('sync-queue');
const Queue = new syncQueue();

const pushQueue = require('./pushQueue');

setInterval(() => {
    model.judgeQueue.find()
        .where('server_number').equals(config.serverNumber)
        .sort({'pending_number' : 1}).limit(1)
        .then(result => {
            if(result.length == 0) throw new Error('no-judge-queue');
            return model.judge.findOne()
                .where('pending_number').equals(result[0].pending_number);
        }).then(result => {
            pushQueue(Queue, result);
            return model.judgeQueue.where('pending_number').equals(result.pending_number)
                .deleteOne();
        }).catch(err => {
            console.log(err);
    });
}, 5000);
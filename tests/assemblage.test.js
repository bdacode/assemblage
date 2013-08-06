var vows = require('vows'),
    assert = require('assert'),
    redis = require('redis'),
    events = require('events'),
    assemblage = require('../index.js'),
    myClusterName = ('mycluster'+Math.floor(Math.random()*9999)),
    master = assemblage.createMaster(myClusterName),
    worker = assemblage.createWorker(myClusterName),
    payload = {
        _worker:Math.floor(Math.random()*9999),
        key1: 'fgdffg'+Math.floor(Math.random()*9999),
        key2 : [1,2,3,4,5],
        key3 : {
            doOnce:1,
            doSecond:2
        }
    };


vows.describe('Assemblage')
    .addBatch({
        'Redis': {
            'topic': function () {
                var client = redis.createClient(),
                    promise = new (events.EventEmitter);
                client.set('key1', 'val', function (err) {
                    if (err) { promise.emit('error', err) }
                    promise.emit('success', client);
                });
                return promise;
            },
            ' should have the correct version (>2.6.x)': function (err, client) {
                //https://github.com/mranney/node_redis#clientserver_info
                if (err) throw err;
                assert.isObject(client.server_info, 'We do not have the server info object!');
                assert.isString(client.server_info.redis_version, 'Unable to extract the redis server version!');
                assert.isTrue(/^2\.6/.test(client.server_info.redis_version), ' We have redis version of '
                    + client.server_info.redis_version + ' which is NOT SUPPORTED. Use version higher than 2.6.x!');
            }
        }
    })
    .addBatch({
        'Master': {
            'topic': function(){master.addJob(payload, this.callback)},
            'should create a job and fire a callback without error and with jobId': function (err, jobId) {
                if (err) throw err;
                assert.isString(jobId, 'JobId is not string!');
                assert.isTrue(jobId.length > 3, 'Job id is too short!');
            }
        }
    })
    .addBatch({
        'Worker': {
            'topic': worker,
            ' should be event emmiter': function (topic) {
                assert.isFunction(topic.on, ' worker.on is not a function!');
            }
        },
        'Worker processes the job': {
            'topic': function () {
                var promise = new(events.EventEmitter);

                master.addJob(payload, function(err, jobId){
                    if (err) throw err;
                    assert.isString(jobId, 'JobId is not string!');
                    assert.isTrue(jobId.length > 3, 'Job id is too short!');
                    worker.on('add',function(job){
                        promise.emit('success',job);
                    });
                });
                return promise;
            },
            'it should listen to add event and then process job added': function (job) {
                assert.isObject(job.payload, 'job.payload do not exits!');
                assert.deepEqual(job.payload,payload,'We recieved not the message we wanted');
                job.deleteJob(function(){
                    console.log('Job '+job.id+' deleted');
                });
            }
        },
        'Worker terminates':{
            'topic': function () {
                var worker=assemblage.createWorker(myClusterName+'a'),
                    promise = new(events.EventEmitter);

                worker.on('close',function(){
                    promise.emit('success','closed');
                });
                worker.terminate();
                return promise;
            },
            'and should emit event of "close"':function(message){
                assert.equal(message,'closed','Worker do not emits event of "close" being terminated!');
            }
        }
    })
    .export(module);

assemblage
==========

**assemblage** is a super simple module to create distributed clusters of worker processes with one or more master.

Master process has an interface to add and remove jobs. Worker processes check in for new jobs and emit information about new jobs received or removed. If master goes down, no new jobs can be added but workers continue working with current jobs unaffected. When a worker goes down, master reassigns all the jobs of the worker to other workers.

All the synchronization adn queues between master and workers is done with the help of Redis.

## Master

Master shares jobs between clients.

Create master with

    assemblage.createMaster(clusterId, redisConfig)

where

  * **clusterId** is a string identifying the cluster. Workers will need to know this value to connect. Additionally, all Redis keys are prefixed by default with this value, so try not to use overly long string.
  * **redisConfig** is an optional Redis configuration object
    * **client** an existing Redis connection if you do not want to create a new one
    * **host** Redis hostname (optional, defaults to `"localhost"`)
    * **port** Redis port (optional, defaults to `6379`)
    * **prefix** optional prefix for the keys if you do not want to use cluster Id as the prefix
    * **db** numeric id of a Redis DB to use (defaults to `0`)

**Example**

```javascript
var assemblage = require("assemblage");
var master = assemblage.createMaster("my-cluster", {host: "localhost"});
```

### Add new job

To add a new job, simply call

  master.addJob(data, callback)

Where

  * **data** is an optional data object
  * **callback** will be called after the job has been registered. The first parameter is an error object or null and the second one contains the registered id of the job.

```javascript
master.addJob({key: "value"}, function(err, jobId){
    console.log("Added new job with ID: %s", jobId);
});
```

### Remove a job

To remove previously registered job, simply call

  master.deleteJob(jobId, callback)

Where

  * **jobId** is the registered id of the job (received from `addJob`)
  * **callback** will be called after the job has been marked for deletion. The first parameter is an error object or null and the second one contains the registered id of the job.

```javascript
master.deleteJob("12345, function(err, jobId){
    console.log("Deleted job with ID: %s", jobId);
});
```

## Worker

Worker receives jobs queued by the master.

Create a worker with

    assemblage.createWorker(clusterId, redisConfig)

where

  * **clusterId** is a string identifying the cluster. There needs to be master using the same Id, otherwise there's nowhere to connect to (Master can join later though, if there is no master, the worker just sits idle).
  * **redisConfig** is an optional Redis configuration object
    * **client** an existing Redis connection if you do not want to create a new one
    * **host** Redis hostname (optional, defaults to `"localhost"`)
    * **port** Redis port (optional, defaults to `6379`)
    * **prefix** optional prefix for the keys if you do not want to use cluster Id as the prefix
    * **db** numeric id of a Redis DB to use (defaults to `0`)

**Example**

```javascript
var assemblage = require("assemblage");
var worker = assemblage.createWorker("my-cluster", {host: "localhost"});
```

### Listen for new jobs

Worker can listen for new jobs with `"add"` event. The event has one parameter - job object.

```javascript
worker.on("add", function(job){
    console.log("Received new job %s", job.id);
    console.log(job.payload);
});
```

### Listen for job removals

Job removals with can be listened with `"delete"` events on the job object. Whatever this job was doing when a `"delete"` event is received, should be terminated. `"delete"` is emitted only once, so no need to use `on()` method to listen for it, use `once()` instead.

```javascript
job.once("delete", function(){
    console.log("Remove job %s", job.id);
});
```

You can remove a job in the worker as well with using `job.deleteJob(callback)` - this doesn't actually remove the job, but queues it for deletion.

### Stop worker

A worker can be closed and all jobs released for reassignment to other workers with `terminate(callback)`

```javascript
worker.terminate();
```

For all jobs a `"delete"` event is emitted as well when terminating

Terminating a worker (either by `terminate` method or forced by the expired lock) also emits `"close"` event.

```javascript
worker.on("close", function(){
   console.log("The worker was closed, no new jobs for this one");
});
```

### Listen for errors

On unexpected errors an `"error"` event is thrown.

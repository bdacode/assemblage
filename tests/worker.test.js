var vows = require('vows'),
    assert = require('assert'),
    redis = require('redis'),
    assemblage = require("../index"),
    master = assemblage.createMaster("mycluster"),
    worker = assemblage.createWorker("mycluster");
    

vows.describe('Worker')
    .addBatch({
	  'is an event emmiter,':{
		  'topic':worker,
		  'it emmits events':function(topic){
           assert.isFunction(topic.on,' worker.on is not a function!');
          }
      },
      'it processes the job':{
          topic:function(){
			    worker.on('add',this.callback);
				master.addJob({_worker:"1234", key1:"fgdffg"}, function(err, jobId){
					if(err){
						throw err;
					}
					console.log("Created JOB %s", jobId);
				});
		  },
		  'it listens to add event and then recieves the job':function(job){
	         assert.isObject(job.payload,'job.payload do not exits!');
	         assert.equal(job.payload._worker,'1234');
	         assert.equal(job.payload.key1,'fgdffg');
	      }
      }	
	
	})
    .export(module);
    
    
    
    

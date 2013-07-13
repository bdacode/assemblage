var vows = require('vows'),
    assert = require('assert'),
    redis = require('redis'),
    assemblage = require("../index");
    
vows.describe('Master module test')
	.addBatch({
	  'Redis':{
		    'topic':redis.createClient(6379,'127.0.0.1'),
			'accepts connections, allows to add and delete key...':function(topic){
			  topic.on("error",function(err){
			      throw err;  
			  });	
			  var keyName="string key"+Math.random();
			  topic.set(keyName, "string val", function(err){
				  if(err) throw err;
				  topic.get(keyName,function(err2,value){
				    if(err2) throw err2;
				    assert.equal(value,"string val",'Key was not set!');
				    topic.del(keyName,topic.print);
				  });  
			  });
			},
			'has correct version':function(topic){
			  topic.on('error',function(err){
				throw err;  
			  });		

			  topic.info(function(err,info){
				if(err) throw err;
				assert.isString(info);
				assert.isTrue(info.lenght>10);
				assert.isTrue((/^redis_version\:2\.6/).test(info) ,'Redis have wrong version!');
			  });
			}	
	    }
	})
	.addBatch({
	   'Master':{
		   'topic':assemblage.createMaster("mycluster",{
			   client:redis.createClient(6379,'127.0.0.1')
			}),
			'do creates a job and fires a callback without error and with jobId':function(topic){
				topic.addJob({_worker:"1234", key1:"fgdffg"}, 
				function(err, jobId){
					if(err){
						throw err;
					}
					assert.isString(jobId,'Job id is not string!');
					assert.isTrue(jobId.lenght()>3,'Job id is too short!');
				});
			}
		}
	})
	.export(module);

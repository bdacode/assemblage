--[[

KEYS[1] = worker.worker_id.delete
KEYS[2] = job.JOB_ID

ARGV[1] = WORKER_ID
ARGV[2] = JOB_ID

--]]

local worker_id = redis.call('hget', KEYS[2], "_worker");

if worker_id == ARGV[1] then
    redis.call('hset', KEYS[2], '_action', 'delete');

    -- ensure there is only one record in the list
    redis.call('lrem', KEYS[1], 0, ARGV[2]);
    redis.call('lpush', KEYS[1], ARGV[2]);
end;

return ARGV[1];

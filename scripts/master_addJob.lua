--[[
if job is added, add this to unassigned list (lpush unassigned JOB_ID),
update job hash: _action=add (HSET job.JOB_ID _action add),
also add job id to all jobs list (sadd all JOB_ID).
if job data is set, add it (hmset job.JOB_ID -job_data-)

KEYS[1] = all
KEYS[2] = unassigned

ARGV[1] = JOB_ID

]]--

-- redis.log(redis.LOG_WARNING, "log sample")

if redis.call('sismember', KEYS[1], ARGV[1]) ~= 0 then
    return 0;
else
    redis.call('sadd', KEYS[1], ARGV[1]);
    redis.call('lpush', KEYS[2], ARGV[1]);
    return 1;
end

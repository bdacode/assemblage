--[[

if job is removed, then if in unassigned list (hget job.JOB_ID _worker == ""),
removes it from unassigned list (lrem unassigned 0 JOB_ID), from all jobs list (srem all JOB_ID),
removes job hash (DEL job.JOB_ID).

if assigned (WORKER_ID = hget job.JOB_ID _worker), adds a notice to job hash _worker delete list
(lpush worker.WORKER_ID.delete JOB_ID), update job hash: _action=delete (HSET job.JOB_ID _action delete).

KEYS[1] = job.JOB_ID
KEYS[2] = all
KEYS[3] = unassigned
KEYS[4] = worker_prefix

ARGV[1] = JOB_ID

--]]

local worker_id = redis.call('hget', KEYS[1], "_worker");
if not worker_id or worker_id == "" then
    redis.log(redis.LOG_WARNING, "unassigned " .. ARGV[1])
    redis.call('del', KEYS[1]);
    redis.call('srem', KEYS[2], ARGV[1]);
    redis.call('lrem', KEYS[3], 0, ARGV[1]);
    return "";
else
    redis.log(redis.LOG_WARNING, "removed " .. ARGV[1] .. " from " .. worker_id)
    redis.call('hset', KEYS[1], '_action', 'delete');

    -- ensure there is only one record in the list
    redis.call('lrem', KEYS[4] .. worker_id .. '.delete', 0, ARGV[1]);
    redis.call('lpush', KEYS[4] .. worker_id .. '.delete', ARGV[1]);
    return worker_id;
end;

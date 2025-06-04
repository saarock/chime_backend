
-- Step 1: Input
local userId   = ARGV[1]
local metaKey  = "chime-video-user:" .. userId


-- Step 2: Get the metaData

local getMetaDataOfTheUser = redis.hgetAll(metaKey)

return getMetaDataOfTheUser
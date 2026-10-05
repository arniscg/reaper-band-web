-- getSetlist
--
-- The setlist: ordered song region GUIDs stored in the project. Ids of songs
-- that no longer exist are kept (the page skips them), so restoring a deleted
-- region brings it back in place.
--
-- args:    { }
-- returns: { ids = [ guid, ... ] }
--
-- REAPER API: GetProjExtState

local U = B.call("util")

local ids = {}
for _, id in ipairs(U.getJSON("setlist", {})) do
  if type(id) == "string" then ids[#ids + 1] = id end
end
return { ids = ids }

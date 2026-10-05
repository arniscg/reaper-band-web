-- setSetlist
--
-- Replace the setlist and save the project.
--
-- args:    { ids = [ guid, ... ] }
-- returns: { ids = [ guid, ... ] }
--
-- REAPER API: SetProjExtState, Main_SaveProject

local args = ...
local U = B.call("util")

if type(args.ids) ~= "table" then error("setSetlist needs a list of song ids", 0) end
local ids = {}
for _, id in ipairs(args.ids) do
  if type(id) == "string" and not U.contains(ids, id) then ids[#ids + 1] = id end
end

U.setJSON("setlist", ids)
U.save()
U.changed()
return { ids = ids }

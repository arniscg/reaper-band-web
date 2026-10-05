-- markProject
--
-- Mark the active project as the band project (Setup screen button) and
-- save it. The page refuses to operate on a project without the marker.
--
-- args:    { }
-- returns: { marker = true }
--
-- REAPER API: SetProjExtState, Main_SaveProject

local U = B.call("util")

if U.projectFile() == "" then error("Save the project in REAPER first, then mark it.", 0) end
U.set("marker", "1")
U.save()
U.changed()
return { marker = true }

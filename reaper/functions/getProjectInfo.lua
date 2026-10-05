-- getProjectInfo
--
-- Facts about the active project for the header and the Setup diagnostics.
--
-- args:    { }
-- returns: { name           = project file name ("Unsaved project" if never saved),
--            saved          = bool, the project has a file,
--            marker         = true if the band project marker is present,
--            mode           = "live" | "practice",
--            reaperVersion  = GetAppVersion(),
--            recordPath     = current record path,
--            freeDiskMB     = free space on the record path (-1 if unknown),
--            lanes          = { songs = bool, parts = bool },
--            laneInfo, laneCount = as getSongMap (diagnostics),
--            missingActions = [ REAPER action names that could not be found ],
--            stopMarker     = { ok = bool, problem = text if not usable } }
--
-- REAPER API: EnumProjects, GetProjExtState, GetAppVersion,
--             GetSetProjectInfo_String ("RECORD_PATH"), GetFreeDiskSpaceForRecordPath

local R = reaper
local U = B.call("util")

local file = U.projectFile()
local name = file:match("([^/\\]+)$") or ""
local _, record_path = R.GetSetProjectInfo_String(0, "RECORD_PATH", "", false)
local map = B.call("getSongMap")

return {
  name = name ~= "" and name or "Unsaved project",
  saved = file ~= "",
  marker = U.get("marker") == "1",
  mode = U.mode(),
  reaperVersion = R.GetAppVersion(),
  recordPath = record_path ~= "" and record_path or "(project folder)",
  freeDiskMB = R.GetFreeDiskSpaceForRecordPath(0, 0),
  lanes = map.lanes,
  laneInfo = map.laneInfo,
  laneCount = map.laneCount,
  missingActions = U.missingActions(),
  stopMarker = { ok = U.stopMarkerProblem() == nil, problem = U.stopMarkerProblem() },
}

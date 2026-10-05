-- probeLanes  (dev only, run with tools/bridge.mjs)
--
-- Reports how this REAPER handles ruler lanes, without changing anything:
-- lane count, the name/flags of each lane index, and the lane number of
-- every region.
--
-- args:    { }
-- returns: { version, count, lanes = [ ... ], regions = [ ... ] }

local R = reaper
local out = { version = R.GetAppVersion() }
out.count = R.GetSetProjectInfo(0, "RULER_LANE_COUNT", 0, false)

out.lanes = {}
for i = -1, 4 do
  local ok_name, name = R.GetSetProjectInfo_String(0, "RULER_LANE_NAME:" .. i, "", false)
  local ok_guid, guid = R.GetSetProjectInfo_String(0, "RULER_LANE_GUID:" .. i, "", false)
  out.lanes[#out.lanes + 1] = {
    index = i,
    nameOk = ok_name, name = name,
    guidOk = ok_guid, guid = guid,
    default = R.GetSetProjectInfo(0, "RULER_LANE_DEFAULT:" .. i, 0, false),
    hidden = R.GetSetProjectInfo(0, "RULER_LANE_HIDDEN:" .. i, 0, false),
  }
end

out.regions = {}
if R.GetNumRegionsOrMarkers then
  for i = 0, R.GetNumRegionsOrMarkers(0) - 1 do
    local m = R.GetRegionOrMarker(0, i, "")
    local _, name = R.GetSetRegionOrMarkerInfo_String(0, m, "P_NAME", "", false)
    out.regions[#out.regions + 1] = {
      name = name,
      region = R.GetRegionOrMarkerInfo_Value(0, m, "B_ISREGION"),
      lane = R.GetRegionOrMarkerInfo_Value(0, m, "I_LANENUMBER"),
    }
  end
end
return out

-- tryLanes  (dev only, run with tools/bridge.mjs; CHANGES the open project)
--
-- Experiments with ruler lanes. Round 2: name an existing lane, move a region
-- into an existing lane, and try other ways of inserting a lane.
--
-- args:    { }
-- returns: { steps = [ ... ] }

local R = reaper
local steps = {}
local function log(what, ...) steps[#steps + 1] = { what = what, values = { ... } } end

local function lanes()
  local out = {}
  for i = 0, 8 do
    local ok, name = R.GetSetProjectInfo_String(0, "RULER_LANE_NAME:" .. i, "", false)
    if ok then out[#out + 1] = i .. ":" .. name .. "(d" .. R.GetSetProjectInfo(0, "RULER_LANE_DEFAULT:" .. i, 0, false) .. ")" end
  end
  return table.concat(out, " ")
end

local function region(name)
  for i = 0, R.GetNumRegionsOrMarkers(0) - 1 do
    local m = R.GetRegionOrMarker(0, i, "")
    local _, nm = R.GetSetRegionOrMarkerInfo_String(0, m, "P_NAME", "", false)
    if nm == name then return m end
  end
end

log("lanes at start", lanes())
log("name lane 0 = 'ProbeA'", R.GetSetProjectInfo_String(0, "RULER_LANE_NAME:0", "ProbeA", true))
log("lanes", lanes())

local m = region("probe region")
log("probe region lane", m and R.GetRegionOrMarkerInfo_Value(0, m, "I_LANENUMBER"))
if m then
  log("set lane 1", R.SetRegionOrMarkerInfo_Value(0, m, "I_LANENUMBER", 1))
  log("probe region lane now", R.GetRegionOrMarkerInfo_Value(0, m, "I_LANENUMBER"))
end

for _, v in ipairs({ 0, 1, -1 }) do
  log("ORDER:-1 = " .. v, R.GetSetProjectInfo(0, "RULER_LANE_ORDER:-1", v, true))
  log("lanes", lanes())
end
log("count", R.GetSetProjectInfo(0, "RULER_LANE_COUNT", 0, false))
return { steps = steps }

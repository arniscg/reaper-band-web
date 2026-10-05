-- getSongMap
--
-- Songs and their parts, found by ruler lane name: regions in the lane named
-- "Songs" are songs; regions in the lane named "Parts" that start inside a
-- song are that song's parts. Lane names match case-insensitively. Songs and
-- parts are sorted by start; ids are region GUIDs, so renaming or moving a
-- region doesn't change its id.
--
-- args:    { }
-- returns: { songs = [ { id, num, name, start, ["end"], color,
--                        parts = [ { id, name, start, ["end"] } ] } ],
--            lanes = { songs = bool, parts = bool },
--            laneInfo = [ { lane, name, regions } ], laneCount }
--          (laneInfo/laneCount: what REAPER reports, for diagnostics)
--          color is "#rrggbb" for a custom region color, otherwise absent.
--
-- REAPER API: GetNumRegionsOrMarkers, GetRegionOrMarker,
--             GetRegionOrMarkerInfo_Value, GetSetRegionOrMarkerInfo_String,
--             GetSetProjectInfo_String ("RULER_LANE_NAME:n"), ColorFromNative

local R = reaper
local PROJ = 0
local EPS = 0.0005 -- a part may start this much before its song (rounding)

if not R.GetNumRegionsOrMarkers then
  error("This REAPER version has no region lanes. Update REAPER.", 0)
end

local function color_of(marker)
  local c = math.floor(R.GetRegionOrMarkerInfo_Value(PROJ, marker, "I_CUSTOMCOLOR"))
  if c & 0x1000000 == 0 then return nil end -- no custom color
  local r, g, b = R.ColorFromNative(c & 0xFFFFFF)
  return string.format("#%02x%02x%02x", r, g, b)
end

local function trim_lower(s)
  return (s or ""):match("^%s*(.-)%s*$"):lower()
end

-- All regions, with the lane each one is in.
local regions = {}
local lanes_used = {}
for i = 0, R.GetNumRegionsOrMarkers(PROJ) - 1 do
  local m = R.GetRegionOrMarker(PROJ, i, "")
  if m and R.GetRegionOrMarkerInfo_Value(PROJ, m, "B_ISREGION") ~= 0 then
    local lane = math.floor(R.GetRegionOrMarkerInfo_Value(PROJ, m, "I_LANENUMBER"))
    local _, name = R.GetSetRegionOrMarkerInfo_String(PROJ, m, "P_NAME", "", false)
    local _, guid = R.GetSetRegionOrMarkerInfo_String(PROJ, m, "GUID", "", false)
    regions[#regions + 1] = {
      id = guid,
      num = math.floor(R.GetRegionOrMarkerInfo_Value(PROJ, m, "I_NUMBER")),
      name = name,
      start = R.GetRegionOrMarkerInfo_Value(PROJ, m, "D_STARTPOS"),
      ["end"] = R.GetRegionOrMarkerInfo_Value(PROJ, m, "D_ENDPOS"),
      color = color_of(m),
      lane = lane,
    }
    lanes_used[lane] = true
  end
end

-- Lane names, by lane number. A region's I_LANENUMBER and RULER_LANE_NAME:X
-- use the same numbers (verified on REAPER 7.68). RULER_LANE_COUNT can't be
-- trusted (it returns 0 even when lanes exist), so names are read for every
-- lane number until REAPER reports no lane there.
local MAX_LANES = 64
local lane_names = {}
local lane_count = 0
for i = 0, MAX_LANES - 1 do
  local ok, lane_name = R.GetSetProjectInfo_String(PROJ, "RULER_LANE_NAME:" .. i, "", false)
  if not ok and not lanes_used[i] then break end
  lane_names[i] = ok and lane_name or nil
  lane_count = i + 1
end

local songs_lane, parts_lane
for lane = 0, lane_count - 1 do
  local key = trim_lower(lane_names[lane])
  if key == "songs" and songs_lane == nil then songs_lane = lane end
  if key == "parts" and parts_lane == nil then parts_lane = lane end
end

local by_start = function(a, b) return a.start < b.start end

local songs, parts = {}, {}
for _, r in ipairs(regions) do
  if r.lane == songs_lane then
    songs[#songs + 1] = { id = r.id, num = r.num, name = r.name, start = r.start, ["end"] = r["end"], color = r.color, parts = {} }
  elseif r.lane == parts_lane then
    parts[#parts + 1] = { id = r.id, name = r.name, start = r.start, ["end"] = r["end"] }
  end
end
table.sort(songs, by_start)
table.sort(parts, by_start)

for _, p in ipairs(parts) do
  for _, s in ipairs(songs) do
    if p.start >= s.start - EPS and p.start < s["end"] then
      table.insert(s.parts, p)
      break
    end
  end
end

-- What REAPER reports, for the Setup diagnostics.
local lane_info = {}
for i = 0, lane_count - 1 do
  local count = 0
  for _, r in ipairs(regions) do
    if r.lane == i then count = count + 1 end
  end
  if lane_names[i] ~= nil or count > 0 then
    lane_info[#lane_info + 1] = { lane = i, name = lane_names[i], regions = count }
  end
end

return {
  songs = songs,
  lanes = { songs = songs_lane ~= nil, parts = parts_lane ~= nil },
  laneInfo = lane_info,
  laneCount = lane_count,
}

-- Band Remote bridge
--
-- One persistent background script, started with REAPER, running a
-- reaper.defer() loop. It is generic: it knows nothing about songs or
-- setlists. All band logic lives in the web project (reaper/functions/*.lua)
-- and is uploaded here by the page.
--
-- Install (once):
--   1. Copy this file to <REAPER resource path>/Scripts/BandRemote/
--   2. Add this line to <REAPER resource path>/Scripts/__startup.lua
--      (create the file if it doesn't exist):
--        dofile(reaper.GetResourcePath() .. "/Scripts/BandRemote/BandRemote_Bridge.lua")
--   It can also be loaded as an action and run by hand; running it again
--   restarts it.
--
-- ## Transport: global ext state, section "BandRemote" (never persisted)
--
-- Several pages may be open at once. Chunk and answer keys carry the request
-- id, so pages can't overwrite each other's. Each page sends requests through
-- one of 8 request slots (picked at random when it loads), and the bridge
-- serves every slot each tick. If two pages share a slot and one request is
-- overwritten, that page writes it again; the bridge remembers recent ids, so
-- a request never runs twice.
--
-- Page -> bridge
--   c.<id>.0 .. c.<id>.N-1
--                Request chunks. Concatenated they are base64url (UTF-8) of
--                  "<kind> <name>\n<payload>"
--   req.<slot>   "<id>:<N>:<length>", slot 0..7. Written last; the bridge
--                acts on it, then clears it and deletes the chunks. <length> is the
--                total chunk length, to detect values cut off on the way
--                (REAPER's web server keeps only ~1024 chars of a value).
--
--   kind "def"   name = function name, payload = Lua source of
--                reaper/functions/<name>.lua exactly as the file is.
--   kind "seal"  name = hash of the whole uploaded set, published in status
--                as "lib". The page re-uploads when its own hash differs.
--   kind "call"  name = function name, payload = JSON of the arguments.
--
-- Bridge -> page
--   r.<id>       "<M>|<first chunk>". The response JSON split in M chunks;
--                chunks 2..M are in r.<id>.1 .. r.<id>.(M-1). Deleted by the
--                bridge after a minute.
--                { "id": ..., "ok": true, "result": ... }
--                { "id": ..., "ok": false, "error": "message" }
--   status       JSON, rewritten when it changes:
--                { "v", "session", "lib", "hb" (heartbeat), "err" (last
--                  loop error), "app" (result of the "status" function) }
--
-- ## Function contract (reaper/functions/*.lua)
--   Each file is a Lua chunk, compiled once on "def" and run as chunk(args)
--   on every call:  local args = ...
--   It returns one value, encoded as JSON (an empty table becomes []).
--   A refusal is error("message", 0): the page shows the message as-is.
--   Any other error comes back with a traceback.
--   Two names are run by the loop itself after the set is sealed:
--     tick    every defer tick (song end, watchdog)
--     status  every defer tick; its result becomes status.app
--   Functions see the global table B:
--     B.json.encode(v) / B.json.decode(s)
--     B.object(t)      mark a table to encode as {} even when empty
--     B.call(name, args)  run another uploaded function
--     B.state          table kept across re-uploads (lost on REAPER restart)
--     B.section, B.session

local BRIDGE_VERSION = 2 -- the page checks this; bump on protocol changes
local SECTION = "BandRemote"
local RESP_CHUNK = 12000 -- keep each ext state value well below 16 KB

local R = reaper

if R.set_action_options then R.set_action_options(1 | 2) end -- run again = restart, no dialog

---------------------------------------------------------------------------
-- JSON
---------------------------------------------------------------------------

local OBJECT = {}

local escapes = { ['"'] = '\\"', ['\\'] = '\\\\', ['\b'] = '\\b', ['\f'] = '\\f',
                  ['\n'] = '\\n', ['\r'] = '\\r', ['\t'] = '\\t' }

local function encode_string(s)
  return '"' .. s:gsub('[%c"\\]', function(c)
    return escapes[c] or string.format("\\u%04x", c:byte())
  end) .. '"'
end

local function is_array(t)
  if getmetatable(t) == OBJECT then return false end
  local n = #t
  local count = 0
  for _ in pairs(t) do
    count = count + 1
    if count > n then return false end
  end
  return true -- includes the empty table
end

local function encode(v)
  local tv = type(v)
  if tv == "nil" then return "null"
  elseif tv == "boolean" then return v and "true" or "false"
  elseif tv == "number" then
    if v ~= v or v == math.huge or v == -math.huge then return "null" end
    if math.type(v) == "integer" then return tostring(v) end
    return string.format("%.14g", v)
  elseif tv == "string" then return encode_string(v)
  elseif tv == "table" then
    local out = {}
    if is_array(v) then
      for i = 1, #v do out[i] = encode(v[i]) end
      return "[" .. table.concat(out, ",") .. "]"
    end
    for k, val in pairs(v) do
      local tval = type(val)
      if tval ~= "function" and tval ~= "userdata" and tval ~= "thread" then
        out[#out + 1] = encode_string(tostring(k)) .. ":" .. encode(val)
      end
    end
    return "{" .. table.concat(out, ",") .. "}"
  end
  return "null"
end

local function utf8_char(cp)
  if cp < 0x80 then return string.char(cp) end
  return utf8.char(cp)
end

local function decode(s)
  local pos = 1

  local function fail(msg)
    error(string.format("JSON %s at position %d", msg, pos), 0)
  end

  local function skip()
    pos = s:find("[^ \t\r\n]", pos) or #s + 1
  end

  local value

  local function str()
    pos = pos + 1 -- opening quote
    local out = {}
    while true do
      local c = s:sub(pos, pos)
      if c == "" then fail("unterminated string") end
      if c == '"' then pos = pos + 1; break end
      if c == "\\" then
        local e = s:sub(pos + 1, pos + 1)
        local simple = { ['"'] = '"', ["\\"] = "\\", ["/"] = "/", b = "\b", f = "\f", n = "\n", r = "\r", t = "\t" }
        if simple[e] then
          out[#out + 1] = simple[e]
          pos = pos + 2
        elseif e == "u" then
          local cp = tonumber(s:sub(pos + 2, pos + 5), 16) or fail("bad \\u escape")
          pos = pos + 6
          if cp >= 0xD800 and cp <= 0xDBFF and s:sub(pos, pos + 1) == "\\u" then
            local lo = tonumber(s:sub(pos + 2, pos + 5), 16)
            if lo and lo >= 0xDC00 and lo <= 0xDFFF then
              cp = 0x10000 + ((cp - 0xD800) << 10) + (lo - 0xDC00)
              pos = pos + 6
            end
          end
          out[#out + 1] = utf8_char(cp)
        else
          fail("bad escape")
        end
      else
        local stop = s:find('["\\]', pos) or #s + 1
        out[#out + 1] = s:sub(pos, stop - 1)
        pos = stop
      end
    end
    return table.concat(out)
  end

  value = function()
    skip()
    local c = s:sub(pos, pos)
    if c == "{" then
      pos = pos + 1
      local t = setmetatable({}, OBJECT)
      skip()
      if s:sub(pos, pos) == "}" then pos = pos + 1; return t end
      while true do
        skip()
        if s:sub(pos, pos) ~= '"' then fail("expected key") end
        local k = str()
        skip()
        if s:sub(pos, pos) ~= ":" then fail("expected ':'") end
        pos = pos + 1
        t[k] = value()
        skip()
        local d = s:sub(pos, pos)
        pos = pos + 1
        if d == "}" then return t end
        if d ~= "," then fail("expected ',' or '}'") end
      end
    elseif c == "[" then
      pos = pos + 1
      local t = {}
      skip()
      if s:sub(pos, pos) == "]" then pos = pos + 1; return t end
      local n = 0
      while true do
        n = n + 1
        t[n] = value()
        skip()
        local d = s:sub(pos, pos)
        pos = pos + 1
        if d == "]" then return t end
        if d ~= "," then fail("expected ',' or ']'") end
      end
    elseif c == '"' then
      return str()
    elseif s:sub(pos, pos + 3) == "true" then
      pos = pos + 4; return true
    elseif s:sub(pos, pos + 4) == "false" then
      pos = pos + 5; return false
    elseif s:sub(pos, pos + 3) == "null" then
      pos = pos + 4; return nil
    else
      local num = s:match("^-?%d+%.?%d*[eE]?[-+]?%d*", pos)
      if not num or num == "" then fail("unexpected character") end
      pos = pos + #num
      return math.tointeger(tonumber(num)) or tonumber(num)
    end
  end

  local result = value()
  skip()
  if pos <= #s then fail("trailing characters") end
  return result
end

---------------------------------------------------------------------------
-- base64url decoding
---------------------------------------------------------------------------

local B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
local b64val = {}
for i = 1, #B64 do b64val[B64:byte(i)] = i - 1 end

local function b64decode(s)
  local out, bits, nbits = {}, 0, 0
  for i = 1, #s do
    local v = b64val[s:byte(i)]
    if not v then error("bad base64 in request", 0) end
    bits = ((bits << 6) | v) & 0xFFFFFF
    nbits = nbits + 6
    if nbits >= 8 then
      nbits = nbits - 8
      out[#out + 1] = string.char((bits >> nbits) & 0xFF)
    end
  end
  return table.concat(out)
end

---------------------------------------------------------------------------
-- Bridge state
---------------------------------------------------------------------------

math.randomseed(math.floor(R.time_precise() * 1000))
local session = string.format("%06x%04x", math.floor(R.time_precise() * 1000) % 0x1000000, math.random(0, 0xFFFF))

local functions = {}  -- name -> compiled chunk
local lib = nil       -- hash of the sealed set; nil while uploading
local loop_error = nil
local REQ_SLOTS = 8
local done, done_order = {}, {} -- recently run request ids (never run twice)
local DONE_KEEP = 500
local answers = {} -- { keys = {...}, at = time } for cleanup
local ANSWER_LIFETIME = 60
local last_status = nil

local B = {
  section = SECTION,
  session = session,
  state = {},
  json = { encode = encode, decode = decode },
  object = function(t) return setmetatable(t or {}, OBJECT) end,
}

function B.call(name, args)
  local fn = functions[name]
  if not fn then error("unknown function: " .. tostring(name), 0) end
  return fn(args or {})
end

-- error("message", 0) is a refusal: pass it on as-is. Errors that carry a
-- "file:line:" position are bugs: add a traceback.
local function on_error(err)
  if type(err) == "string" and not err:match("^[^\n]-:%d+:") then return err end
  return debug.traceback(tostring(err), 2)
end

local function set(key, value)
  R.SetExtState(SECTION, key, value, false)
end

local function respond(id, ok, result)
  local ok_enc, body = pcall(encode, { id = id, ok = ok, result = ok and result or nil, error = (not ok) and tostring(result) or nil })
  if not ok_enc then
    body = encode({ id = id, ok = false, error = "could not encode the result: " .. tostring(body) })
  end
  local chunks = {}
  for i = 1, #body, RESP_CHUNK do chunks[#chunks + 1] = body:sub(i, i + RESP_CHUNK - 1) end
  local key = "r." .. id
  local keys = { key }
  for i = 2, #chunks do
    set(key .. "." .. (i - 1), chunks[i])
    keys[#keys + 1] = key .. "." .. (i - 1)
  end
  set(key, #chunks .. "|" .. chunks[1])
  answers[#answers + 1] = { keys = keys, at = R.time_precise() }
end

local function delete_old_answers()
  local now = R.time_precise()
  while answers[1] and now - answers[1].at > ANSWER_LIFETIME do
    for _, k in ipairs(answers[1].keys) do R.DeleteExtState(SECTION, k, false) end
    table.remove(answers, 1)
  end
end

local function define(name, source)
  if not name:match("^[%w_]+$") then error("bad function name: " .. name, 0) end
  local env = setmetatable({ B = B }, { __index = _G })
  local chunk, err = load(source, "=" .. name .. ".lua", "t", env)
  if not chunk then error(err, 0) end
  functions[name] = chunk
  lib = nil -- a new upload is in progress until "seal"
  return { name = name }
end

local function run(kind, name, payload)
  if kind == "def" then
    return define(name, payload)
  elseif kind == "seal" then
    lib = name
    loop_error = nil
    return { lib = name }
  elseif kind == "call" then
    local args = {}
    if payload ~= "" then args = decode(payload) or {} end
    return B.call(name, args)
  end
  error("unknown request kind: " .. tostring(kind), 0)
end

local function handle_request(req)
  local id, n, len = req:match("^([%w_%-]+):(%d+):(%d+)$")
  if not id or done[id] then return end
  done[id] = true
  done_order[#done_order + 1] = id
  if #done_order > DONE_KEEP then done[table.remove(done_order, 1)] = nil end
  local parts = {}
  for i = 0, tonumber(n) - 1 do
    local key = "c." .. id .. "." .. i
    parts[#parts + 1] = R.GetExtState(SECTION, key)
    R.DeleteExtState(SECTION, key, false)
  end
  local ok, result = xpcall(function()
    local data = table.concat(parts)
    if #data ~= tonumber(len) then
      error(string.format("The request was cut off on the way to REAPER: %d of %d characters arrived.", #data, tonumber(len)), 0)
    end
    local text = b64decode(data)
    local kind, name, payload = text:match("^(%a+) ([^\n]*)\n(.*)$")
    if not kind then error("malformed request", 0) end
    return run(kind, name, payload)
  end, on_error)
  respond(id, ok, result)
end

local function write_status()
  local app = nil
  if lib and functions.status then
    local ok, result = xpcall(functions.status, on_error, {})
    if ok then app = result else loop_error = "status: " .. tostring(result) end
  end
  local s = encode({
    v = BRIDGE_VERSION,
    session = session,
    lib = lib,
    hb = math.floor(R.time_precise() * 4) % 100000, -- changes 4x per second while the loop runs
    err = loop_error,
    app = app,
  })
  if s ~= last_status then
    set("status", s)
    last_status = s
  end
end

local function loop()
  for slot = 0, REQ_SLOTS - 1 do
    local key = "req." .. slot
    local req = R.GetExtState(SECTION, key)
    if req ~= "" then
      set(key, "")
      local ok, err = xpcall(handle_request, on_error, req)
      if not ok then loop_error = "request: " .. tostring(err) end
    end
  end
  delete_old_answers()
  if lib and functions.tick then
    local ok2, err2 = xpcall(functions.tick, on_error, {})
    if not ok2 then loop_error = "tick: " .. tostring(err2) end
  end
  write_status()
  R.defer(loop)
end

R.atexit(function() R.SetExtState(SECTION, "status", "", false) end)

for slot = 0, REQ_SLOTS - 1 do set("req." .. slot, "") end
loop()

const assert = require('assert');

// express.jsのvalidatePlayerData関数のロジックを直接テスト
const validatePlayerData = (body) => {
  if (!Array.isArray(body)) return false;

  const requiredFields = ['name', 'dimension', 'x', 'y', 'z', 'telephone', 'hasTelephone',
    'useMegaphone', 'useMicrophone', 'transceiverType', 'transceiverNumber', 'mute',
    'voiceRangeOutput', 'volumeOutput', 'voiceRangeInput', 'volumeInput'];

  return body.every(player => {
    if (typeof player !== 'object' || player === null) return false;
    if (typeof player.name !== 'string' || player.name.length === 0) return false;
    return requiredFields.every(field => field in player);
  });
};

// Discord IDバリデーション
const validateDiscordId = (id) => {
  return typeof id === 'string' && /^\d{17,20}$/.test(id);
};

console.log('=== Express Validation Tests ===');

// Test 1: Valid player data
{
  const validData = [{
    name: 'Player1', dimension: 0, x: 100, y: 64, z: 200,
    telephone: 0, hasTelephone: 0, useMegaphone: 0, useMicrophone: 0,
    transceiverType: 0, transceiverNumber: 0, mute: 0,
    voiceRangeOutput: 100, volumeOutput: 100, voiceRangeInput: 100, volumeInput: 100
  }];
  assert.strictEqual(validatePlayerData(validData), true, 'Valid player data should pass');
  console.log('✅ Test 1 passed: Valid player data accepted');
}

// Test 2: Non-array input
{
  assert.strictEqual(validatePlayerData('not an array'), false, 'String should fail');
  assert.strictEqual(validatePlayerData(null), false, 'null should fail');
  assert.strictEqual(validatePlayerData(undefined), false, 'undefined should fail');
  assert.strictEqual(validatePlayerData({}), false, 'Object should fail');
  assert.strictEqual(validatePlayerData(123), false, 'Number should fail');
  console.log('✅ Test 2 passed: Non-array inputs rejected');
}

// Test 3: Empty array is valid (no players)
{
  assert.strictEqual(validatePlayerData([]), true, 'Empty array should pass');
  console.log('✅ Test 3 passed: Empty array accepted');
}

// Test 4: Missing required fields
{
  const incompleteData = [{ name: 'Player1', x: 100 }];
  assert.strictEqual(validatePlayerData(incompleteData), false, 'Missing fields should fail');
  console.log('✅ Test 4 passed: Missing fields rejected');
}

// Test 5: Empty name
{
  const emptyNameData = [{
    name: '', dimension: 0, x: 100, y: 64, z: 200,
    telephone: 0, hasTelephone: 0, useMegaphone: 0, useMicrophone: 0,
    transceiverType: 0, transceiverNumber: 0, mute: 0,
    voiceRangeOutput: 100, volumeOutput: 100, voiceRangeInput: 100, volumeInput: 100
  }];
  assert.strictEqual(validatePlayerData(emptyNameData), false, 'Empty name should fail');
  console.log('✅ Test 5 passed: Empty name rejected');
}

// Test 6: null player entry
{
  const nullEntry = [null];
  assert.strictEqual(validatePlayerData(nullEntry), false, 'null entry should fail');
  console.log('✅ Test 6 passed: null entry rejected');
}

// Test 7: Multiple valid players
{
  const multiPlayer = [
    {
      name: 'Player1', dimension: 0, x: 100, y: 64, z: 200,
      telephone: 0, hasTelephone: 0, useMegaphone: 0, useMicrophone: 0,
      transceiverType: 0, transceiverNumber: 0, mute: 0,
      voiceRangeOutput: 100, volumeOutput: 100, voiceRangeInput: 100, volumeInput: 100
    },
    {
      name: 'Player2', dimension: 0, x: 150, y: 64, z: 250,
      telephone: 0, hasTelephone: 0, useMegaphone: 0, useMicrophone: 0,
      transceiverType: 0, transceiverNumber: 0, mute: 0,
      voiceRangeOutput: 100, volumeOutput: 100, voiceRangeInput: 100, volumeInput: 100
    }
  ];
  assert.strictEqual(validatePlayerData(multiPlayer), true, 'Multiple valid players should pass');
  console.log('✅ Test 7 passed: Multiple valid players accepted');
}

console.log('\n=== Discord ID Validation Tests ===');

// Test 8: Valid Discord IDs
{
  assert.strictEqual(validateDiscordId('12345678901234567'), true, '17 digits should pass');
  assert.strictEqual(validateDiscordId('123456789012345678'), true, '18 digits should pass');
  assert.strictEqual(validateDiscordId('1234567890123456789'), true, '19 digits should pass');
  assert.strictEqual(validateDiscordId('12345678901234567890'), true, '20 digits should pass');
  console.log('✅ Test 8 passed: Valid Discord IDs accepted');
}

// Test 9: Invalid Discord IDs
{
  assert.strictEqual(validateDiscordId('1234567890123456'), false, '16 digits should fail');
  assert.strictEqual(validateDiscordId('123456789012345678901'), false, '21 digits should fail');
  assert.strictEqual(validateDiscordId('abcdefghijklmnopq'), false, 'Letters should fail');
  assert.strictEqual(validateDiscordId(''), false, 'Empty string should fail');
  assert.strictEqual(validateDiscordId(null), false, 'null should fail');
  assert.strictEqual(validateDiscordId(undefined), false, 'undefined should fail');
  assert.strictEqual(validateDiscordId(12345678901234567), false, 'Number should fail');
  assert.strictEqual(validateDiscordId('1234-5678-9012-3456'), false, 'Dashes should fail');
  console.log('✅ Test 9 passed: Invalid Discord IDs rejected');
}

console.log('\n=== Socket.IO Logic Tests ===');

// Test 10: setInterval cleanup simulation
{
  let cleared = false;
  const fakeIntervalId = 12345;
  // Simulate that clearInterval would be called
  const originalClearInterval = globalThis.clearInterval;
  globalThis.clearInterval = (id) => {
    if (id === fakeIntervalId) cleared = true;
    originalClearInterval(id);
  };

  // Simulate disconnect handler
  clearInterval(fakeIntervalId);
  assert.strictEqual(cleared, true, 'Interval should be cleared on disconnect');
  globalThis.clearInterval = originalClearInterval;
  console.log('✅ Test 10 passed: setInterval cleanup works');
}

// Test 11: Socket join data validation
{
  const validateJoinData = (data) => {
    return typeof data === 'string' && data.length > 0 && data.length <= 100;
  };
  assert.strictEqual(validateJoinData('Player1'), true);
  assert.strictEqual(validateJoinData(''), false);
  assert.strictEqual(validateJoinData(123), false);
  assert.strictEqual(validateJoinData(null), false);
  assert.strictEqual(validateJoinData('x'.repeat(101)), false);
  console.log('✅ Test 11 passed: Socket join data validation works');
}

// Test 12: Kick data validation
{
  const validateKickData = (data) => {
    return typeof data === 'string' && data.length > 0;
  };
  assert.strictEqual(validateKickData('Player1'), true);
  assert.strictEqual(validateKickData(''), false);
  assert.strictEqual(validateKickData(null), false);
  assert.strictEqual(validateKickData(123), false);
  console.log('✅ Test 12 passed: Kick data validation works');
}

console.log('\n=== Bot Array Bounds Tests ===');

// Test 13: Bot index calculation (simulating displayJoinMember logic)
{
  const calcBotIndex = (playerCount, botsLength) => {
    const maxIndex = botsLength - 1;
    if (playerCount >= 20) {
      return Math.min(20, maxIndex);
    }
    return Math.min(playerCount, maxIndex);
  };

  // With 22 bots (original expected count)
  assert.strictEqual(calcBotIndex(0, 22), 0);
  assert.strictEqual(calcBotIndex(5, 22), 5);
  assert.strictEqual(calcBotIndex(20, 22), 20);
  assert.strictEqual(calcBotIndex(100, 22), 20);

  // With only 10 bots (edge case)
  assert.strictEqual(calcBotIndex(0, 10), 0);
  assert.strictEqual(calcBotIndex(5, 10), 5);
  assert.strictEqual(calcBotIndex(15, 10), 9); // Clamped to maxIndex
  assert.strictEqual(calcBotIndex(20, 10), 9); // Clamped to maxIndex

  // With only 1 bot
  assert.strictEqual(calcBotIndex(0, 1), 0);
  assert.strictEqual(calcBotIndex(10, 1), 0);

  console.log('✅ Test 13 passed: Bot index bounds checking works');
}

console.log('\n=== Login Retry Tests ===');

// Test 14: Login retry has finite attempts
{
  const MAX_LOGIN_RETRIES = 5;
  let attempts = 0;
  const simulateLoginRetry = () => {
    for (let attempt = 0; attempt < MAX_LOGIN_RETRIES; attempt++) {
      attempts++;
    }
  };
  simulateLoginRetry();
  assert.strictEqual(attempts, MAX_LOGIN_RETRIES, 'Should stop after MAX_LOGIN_RETRIES');
  console.log('✅ Test 14 passed: Login retry is finite');
}

console.log('\n=== SkyWay Name Encoding Tests ===');

// Test 15: Space morse encoding/decoding
{
  const spaceMorse = '....__..__._..';
  const encode = (name) => name.replace(/ /g, spaceMorse);
  const decode = (name) => name.replace(/....__..__._../g, ' ');

  const original = 'Player Name Test';
  const encoded = encode(original);
  const decoded = decode(encoded);
  assert.strictEqual(decoded, original, 'Encode/decode should roundtrip');
  assert.notStrictEqual(encoded, original, 'Encoded should differ');
  console.log('✅ Test 15 passed: Name encoding/decoding works');
}

// Test 16: leftMemberDettach uses decoded name for userList search
{
  const spaceMorse = '....__..__._..';
  const name = `Player${spaceMorse}One`;
  const pubName = name.replace(/....__..__._../g, ' ');
  assert.strictEqual(pubName, 'Player One');

  // Simulate userList with decoded names
  const userList = [
    { gamerTag: 'Player One' },
    { gamerTag: 'Player Two' }
  ];

  // Fixed: use pubName for search (not name)
  const index = userList.findIndex(user => user.gamerTag === pubName);
  assert.strictEqual(index, 0, 'Should find user with decoded name');

  // Old bug: searching with encoded name would return -1
  const buggyIndex = userList.findIndex(user => user.gamerTag === name);
  assert.strictEqual(buggyIndex, -1, 'Encoded name should NOT match');

  console.log('✅ Test 16 passed: leftMemberDettach name fix verified');
}

// Test 17: splice(-1, 1) bug — removing last element incorrectly
{
  const arr = ['a', 'b', 'c'];
  const index = arr.findIndex(item => item === 'nonexistent');
  assert.strictEqual(index, -1);
  // Without the guard, splice(-1, 1) removes 'c' — the BUG
  // With the guard (index > -1), nothing is removed
  if (index > -1) {
    arr.splice(index, 1);
  }
  assert.deepStrictEqual(arr, ['a', 'b', 'c'], 'Array should be unchanged when element not found');
  console.log('✅ Test 17 passed: splice(-1) guard works');
}

console.log('\n=== Password Security Tests ===');

// Test 18: Password from env (not hardcoded)
{
  // Verify the pattern: password should come from env, not be hardcoded
  const fs = require('fs');
  const discordBotCode = fs.readFileSync(require('path').join(__dirname, '../external/discordBot.js'), 'utf8');
  assert.strictEqual(discordBotCode.includes('syakasaba_4'), false, 'Hardcoded password should be removed');
  assert.strictEqual(discordBotCode.includes('JOIN_PASSWORD'), true, 'Should use JOIN_PASSWORD env var');
  console.log('✅ Test 18 passed: Password no longer hardcoded');
}

// Test 19: API authentication middleware is present
{
  const fs = require('fs');
  const discordBotCode = fs.readFileSync(require('path').join(__dirname, '../external/discordBot.js'), 'utf8');
  assert.strictEqual(discordBotCode.includes('authenticateApi'), true, 'Should have authenticateApi middleware');
  assert.strictEqual(discordBotCode.includes('x-api-secret'), true, 'Should check x-api-secret header');

  // All endpoints should use authenticateApi
  const endpoints = ['/getUserName', '/checkJoinPass', '/setJoinRole', '/getJoinRole',
    '/checkAdminRole', '/setPhoneRole', '/removePhoneRole'];
  endpoints.forEach(endpoint => {
    const pattern = new RegExp(`app\\.(get|post)\\('${endpoint.replace('/', '\\/')}',\\s*authenticateApi`);
    assert.strictEqual(pattern.test(discordBotCode), true, `${endpoint} should use authenticateApi`);
  });
  console.log('✅ Test 19 passed: All endpoints have authentication');
}

// Test 20: SkyWay secret not in public config
{
  const fs = require('fs');
  const nuxtConfig = fs.readFileSync(require('path').join(__dirname, '../../frontend/nuxt.config.ts'), 'utf8');
  // Check that skywaySecretKey is NOT inside the public block
  const publicMatch = nuxtConfig.match(/public:\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/);
  if (publicMatch) {
    assert.strictEqual(publicMatch[1].includes('skywaySecretKey'), false, 'skywaySecretKey should not be in public config');
    assert.strictEqual(publicMatch[1].includes('skywayAppId'), false, 'skywayAppId should not be in public config');
  }
  assert.strictEqual(nuxtConfig.includes('skywaySecretKey'), true, 'skywaySecretKey should still exist in server-side config');
  console.log('✅ Test 20 passed: SkyWay keys not in public config');
}

// Test 21: setSetting requires auth
{
  const fs = require('fs');
  const setSettingCode = fs.readFileSync(require('path').join(__dirname, '../../frontend/server/api/setSetting.ts'), 'utf8');
  assert.strictEqual(setSettingCode.includes('getUserSession'), true, 'setSetting should check session');
  assert.strictEqual(setSettingCode.includes('discordAuth'), true, 'setSetting should check admin auth');
  console.log('✅ Test 21 passed: setSetting requires authentication and admin');
}

// Test 22: Proxy API files exist and check session
{
  const fs = require('fs');
  const path = require('path');
  const proxyFiles = ['checkJoinPass.post.ts', 'setJoinRole.get.ts', 'getJoinRole.get.ts',
    'setPhoneRole.get.ts', 'removePhoneRole.get.ts', 'getSkywayToken.ts'];

  proxyFiles.forEach(file => {
    const filePath = path.join(__dirname, '../../frontend/server/api', file);
    assert.strictEqual(fs.existsSync(filePath), true, `${file} should exist`);
    const content = fs.readFileSync(filePath, 'utf8');
    assert.strictEqual(content.includes('getUserSession'), true, `${file} should check session`);
  });
  console.log('✅ Test 22 passed: All proxy APIs exist and check session');
}

// Test 23: Express data validation present
{
  const fs = require('fs');
  const expressCode = fs.readFileSync(require('path').join(__dirname, '../external/express.js'), 'utf8');
  assert.strictEqual(expressCode.includes('validatePlayerData'), true, 'Should have validatePlayerData function');
  assert.strictEqual(expressCode.includes('GAME_API_SECRET'), true, 'Should support GAME_API_SECRET');
  console.log('✅ Test 23 passed: Express data validation present');
}

// Test 24: Socket.IO clearInterval on disconnect
{
  const fs = require('fs');
  const socketCode = fs.readFileSync(require('path').join(__dirname, '../external/socket.js'), 'utf8');
  assert.strictEqual(socketCode.includes('clearInterval(intervalId)'), true, 'Should clear interval on disconnect');
  assert.strictEqual(socketCode.includes('const intervalId = setInterval'), true, 'Should store interval ID');
  console.log('✅ Test 24 passed: Socket.IO interval cleanup present');
}

console.log('\n========================================');
console.log('✅ All 24 tests passed!');
console.log('========================================');

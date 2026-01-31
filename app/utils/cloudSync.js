/**
 * 云端同步工具模块
 * 用于通过 DP 点 113 实现历史记录的云端同步
 */

// 尝试导入 commonApi，如果失败则使用备用方案
let commonApi = null;
try {
  const tuyaPanelApi = require('@tuya/tuya-panel-api');
  commonApi = tuyaPanelApi.commonApi;
} catch (error) {
  console.warn('无法导入 @tuya/tuya-panel-api，将使用备用方案:', error);
}

const HISTORY_DP_ID = 113;

function normalizePublishError(error) {
  if (!error || typeof error !== 'object') {
    return error;
  }
  const normalized = { ...error };
  const code = error.errorCode || error.code;
  const inner = error.innerError || error.inner_error || {};
  if (code === 20028 && (inner.errorCode === '11001' || inner.code === 11001)) {
    normalized.humanMessage = 'DP下发失败：设备繁忙或数据格式/长度不符合 DP 限制';
    normalized.isPublishDpsInvalidParam = true;
  }
  return normalized;
}

function getBleConnectedFlag(deviceInfo) {
  if (!deviceInfo) return undefined;
  if (deviceInfo.isBleConnected !== undefined) return deviceInfo.isBleConnected;
  if (deviceInfo.bleConnected !== undefined) return deviceInfo.bleConnected;
  if (deviceInfo.bluetoothConnected !== undefined) return deviceInfo.bluetoothConnected;
  if (deviceInfo.btConnected !== undefined) return deviceInfo.btConnected;
  return undefined;
}

function isDeviceReadyForPublish(deviceInfo) {
  if (!deviceInfo) return true;
  if (deviceInfo.online === false) return false;
  const bleConnected = getBleConnectedFlag(deviceInfo);
  if (bleConnected === false) return false;
  return true;
}

function utf8ByteLength(str) {
  if (typeof str !== 'string') return 0;
  let bytes = 0;
  for (let i = 0; i < str.length; i += 1) {
    const code = str.charCodeAt(i);
    if (code <= 0x7f) {
      bytes += 1;
      continue;
    }
    if (code <= 0x7ff) {
      bytes += 2;
      continue;
    }
    if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4;
      i += 1;
      continue;
    }
    bytes += 3;
  }
  return bytes;
}

function safeNumber(value, fallback = 0) {
  const n = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeInt(value, fallback = 0) {
  const n = typeof value === 'number' ? value : parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * 格式化时长为 "HH:MM:SS" 格式
 * @param {Number} seconds - 秒数
 * @returns {String} 格式化后的时长字符串
 */
function formatTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  const h = hours.toString().padStart(2, '0');
  const m = minutes.toString().padStart(2, '0');
  const s = secs.toString().padStart(2, '0');
  
  return `${h}:${m}:${s}`;
}

/**
 * 验证历史记录数据的有效性
 * @param {Object} record - 历史记录对象
 * @returns {Boolean} 是否有效
 */
function validateHistoryRecord(record) {
  if (!record || typeof record !== 'object') {
    return false;
  }
  
  // 至少需要有id字段
  if (record.id === undefined || record.id === null) {
    return false;
  }
  
  return true;
}

/**
 * 验证提醒记录数据的有效性
 * @param {Object} tip - 提醒记录对象
 * @returns {Boolean} 是否有效
 */
function validateTipRecord(tip) {
  if (!tip || typeof tip !== 'object') {
    return false;
  }
  
  // 至少需要有id字段
  if (tip.id === undefined || tip.id === null) {
    return false;
  }
  
  return true;
}

/**
 * 将历史记录数组或单条记录格式化为 DP 点 113 需要的 JSON 字符串格式
 * @param {Array|Object} historyData - 历史记录数组或单条记录对象
 * @returns {String} JSON 字符串
 */
function formatHistoryForDp112(historyData) {
  try {
    // 支持单条记录对象或数组
    let historyArray = [];
    if (Array.isArray(historyData)) {
      historyArray = historyData;
    } else if (typeof historyData === 'object' && historyData !== null) {
      // 单条记录，转换为数组
      historyArray = [historyData];
    } else {
      console.warn('formatHistoryForDp112: historyData 格式不正确');
      return JSON.stringify([]);
    }
    
    if (historyArray.length === 0) {
      console.warn('formatHistoryForDp112: historyArray is empty');
      return JSON.stringify([]);
    }
    
    // 格式化每条记录，只保留必要字段（避免触发 DP 字符串长度限制）
    const formattedRecords = [];
    historyArray.forEach((record, index) => {
      try {
        // 验证记录有效性
        if (!validateHistoryRecord(record)) {
          console.warn(`formatHistoryForDp112: 跳过无效记录 [${index}]:`, record);
          return;
        }
        
        // 计算时长（可能是秒数或已格式化的字符串）
        let durationSeconds = 0;
        if (typeof record.duration === 'number') {
          durationSeconds = record.duration;
        } else if (typeof record.duration === 'string') {
          // 尝试解析已格式化的时长字符串 "HH:MM:SS"
          const parts = record.duration.split(':');
          if (parts.length === 3) {
            durationSeconds = parseInt(parts[0]) * 3600 + 
                             parseInt(parts[1]) * 60 + 
                             parseInt(parts[2]);
          } else {
            durationSeconds = parseInt(record.duration) || 0;
          }
        }
        
        const formattedDuration = formatTime(durationSeconds);
       
        const distanceValue = safeNumber(record.distance, 0);
        const caloriesValue = safeInt(record.calories, 0);
        const heartRateValue = safeInt(record.heartRate, safeInt(record.hrBpm, 0));
        const speedKmhValue = safeNumber(record.speedKmh, Number.isFinite(safeNumber(record.speed, NaN)) ? safeNumber(record.speed, 0) : 0);
        const inclineValue = safeNumber(
          record.incline !== undefined ? record.incline : (record.Load !== undefined ? record.Load : (record.load !== undefined ? record.load : 0)),
          0
        );
        const maxResistanceValue = safeInt(record.maxResistance, 0);
        const minResistanceValue = safeInt(record.minResistance, 0);
        const maxSpeedValue = safeNumber(record.maxSpeed, 0);
        const minSpeedValue = safeNumber(record.minSpeed, 0);
        const maxInclineValue = safeNumber(record.maxIncline, 0);
        const minInclineValue = safeNumber(record.minIncline, 0);

        let dateMs = null;
        if (record.date !== undefined && record.date !== null) {
          const ms = typeof record.date === 'number' ? record.date : Date.parse(record.date);
          if (Number.isFinite(ms)) dateMs = ms;
        }
        if (dateMs === null && record.dateFormatted) {
          const ms = Date.parse(record.dateFormatted);
          if (Number.isFinite(ms)) dateMs = ms;
        }
        if (dateMs === null && record.id) {
          const ms = typeof record.id === 'number' ? record.id : parseInt(record.id, 10);
          if (Number.isFinite(ms)) dateMs = ms;
        }
        if (dateMs === null) {
          dateMs = Date.now();
        }

        const formattedRecord = {
          id: record.id || Date.now(),
          duration: durationSeconds,
          date: dateMs,
          distance: Number(distanceValue.toFixed(2)),
          calories: caloriesValue,
          heartRate: heartRateValue,
          speedKmh: Number(speedKmhValue.toFixed(1)),
          incline: Number(inclineValue.toFixed(1)),
          isGoalMode: record.isGoalMode === true,
          maxSpeed: Number(maxSpeedValue.toFixed(1)),
          minSpeed: Number(minSpeedValue.toFixed(1)),
          maxIncline: Number(maxInclineValue.toFixed(1)),
          minIncline: Number(minInclineValue.toFixed(1))
        };

        if (maxResistanceValue !== 0) {
          formattedRecord.maxResistance = maxResistanceValue;
        }
        if (minResistanceValue !== 0) {
          formattedRecord.minResistance = minResistanceValue;
        }
        
        formattedRecords.push(formattedRecord);
      } catch (error) {
        console.error(`formatHistoryForDp112: 处理记录 [${index}] 时出错:`, error, record);
      }
    });
    
    if (formattedRecords.length === 0) {
      console.warn('formatHistoryForDp112: 没有有效的记录可以格式化');
      return JSON.stringify([]);
    }
    
    const jsonString = JSON.stringify(formattedRecords);
    
    // 验证JSON字符串是否有效
    try {
      JSON.parse(jsonString);
      const bytes = utf8ByteLength(jsonString);
      console.log(`formatHistoryForDp112: 成功格式化 ${formattedRecords.length} 条记录，JSON长度: ${bytes} bytes`);
    } catch (error) {
      console.error('formatHistoryForDp112: 生成的JSON字符串无效:', error);
      return JSON.stringify([]);
    }
    
    return jsonString;
  } catch (error) {
    console.error('formatHistoryForDp112 error:', error);
    return JSON.stringify([]);
  }
}

/**
 * 将提醒记录数组或单条记录格式化为 DP 点 113 需要的 JSON 字符串格式
 * @param {Array|Object} tipsData - 提醒记录数组或单条记录对象
 * @returns {String} JSON 字符串
 */
function formatTipsForDp113(tipsData) {
  try {
    // 支持单条记录对象或数组
    let tipsArray = [];
    if (Array.isArray(tipsData)) {
      tipsArray = tipsData;
    } else if (typeof tipsData === 'object' && tipsData !== null) {
      // 单条记录，转换为数组
      tipsArray = [tipsData];
    } else {
      console.warn('formatTipsForDp113: tipsData 格式不正确');
      return JSON.stringify([]);
    }
    
    if (tipsArray.length === 0) {
      console.warn('formatTipsForDp113: tipsArray is empty');
      return JSON.stringify([]);
    }
    
    // 格式化每条记录，只保留必要字段
    const formattedTips = [];
    tipsArray.forEach((tip, index) => {
      try {
        // 验证记录有效性
        if (!validateTipRecord(tip)) {
          console.warn(`formatTipsForDp113: 跳过无效记录 [${index}]:`, tip);
          return;
        }
        
        // 处理日期时间字段
        let dateTime = tip.dateTime || tip.date || new Date().toISOString();
        
        // 确保 date 字段存在
        let date = tip.date;
        if (!date && dateTime) {
          try {
            const dateObj = new Date(dateTime);
            date = dateObj.toISOString().split('T')[0] + 'T00:00:00.000Z';
          } catch (error) {
            date = new Date().toISOString();
          }
        }
        
        // 确保 time 字段存在且格式正确
        let time = tip.time;
        if (!time || typeof time !== 'object') {
          try {
            const dateObj = new Date(dateTime);
            time = {
              hour: dateObj.getHours(),
              minute: dateObj.getMinutes()
            };
          } catch (error) {
            time = { hour: 0, minute: 0 };
          }
        }
        
        // 确保 time 对象包含 hour 和 minute
        if (typeof time.hour !== 'number') {
          time.hour = 0;
        }
        if (typeof time.minute !== 'number') {
          time.minute = 0;
        }
        
        // 生成可读的显示文本，用于设备日志页面显示
        const displayText = [
          `标题：${tip.title || ''}`,
          `日期：${date}`,
          `时间：${time.hour.toString().padStart(2, '0')}:${time.minute.toString().padStart(2, '0')}`
        ].join(' | ');
        
        const formattedTip = {
          id: tip.id || Date.now().toString(),
          title: tip.title || '',
          date: date,
          time: {
            hour: time.hour,
            minute: time.minute
          },
          dateTime: dateTime,
          // 添加可读的显示文本字段，用于设备日志页面显示
          displayText: displayText
        };
        
        formattedTips.push(formattedTip);
      } catch (error) {
        console.error(`formatTipsForDp113: 处理记录 [${index}] 时出错:`, error, tip);
      }
    });
    
    if (formattedTips.length === 0) {
      console.warn('formatTipsForDp113: 没有有效的记录可以格式化');
      return JSON.stringify([]);
    }
    
    const jsonString = JSON.stringify(formattedTips);
    
    // 验证JSON字符串是否有效
    try {
      JSON.parse(jsonString);
      console.log(`formatTipsForDp113: 成功格式化 ${formattedTips.length} 条记录，JSON长度: ${jsonString.length} 字节`);
    } catch (error) {
      console.error('formatTipsForDp113: 生成的JSON字符串无效:', error);
      return JSON.stringify([]);
    }
    
    return jsonString;
  } catch (error) {
    console.error('formatTipsForDp113 error:', error);
    return JSON.stringify([]);
  }
}

/**
 * 将历史记录通过 DP 点 113 上报到云端
 * @param {String} deviceId - 设备 ID
 * @param {Array|Object} historyData - 历史记录数据（可以是数组或单条记录）
 * @returns {Promise} Promise 对象
 */
function saveHistoryToCloud(deviceId, historyData) {
  return new Promise((resolve, reject) => {
    if (!deviceId) {
      console.warn('saveHistoryToCloud: deviceId is required');
      reject(new Error('设备ID不能为空'));
      return;
    }

    try {
      let historyArray = [];
      if (Array.isArray(historyData)) {
        historyArray = historyData.slice(0, 1);
      } else {
        historyArray = [historyData];
      }

      // 格式化为 JSON 字符串
      const dp112Value = formatHistoryForDp112(historyArray);
      
      // 验证数据格式
      if (!dp112Value || dp112Value === '[]' || dp112Value.length === 0) {
        console.error('saveHistoryToCloud: 格式化后的数据为空或无效');
        reject(new Error('数据格式化失败，无法上报'));
        return;
      }
      
      // 验证JSON格式
      try {
        const parsed = JSON.parse(dp112Value);
        if (!Array.isArray(parsed) || parsed.length === 0) {
          console.error('saveHistoryToCloud: 解析后的数据不是有效数组或为空');
          reject(new Error('数据格式验证失败'));
          return;
        }
      } catch (error) {
        console.error('saveHistoryToCloud: JSON格式验证失败:', error);
        reject(new Error('数据格式验证失败: ' + error.message));
        return;
      }
      
      // 通过 publishDps 下发到设备，设备需要主动上报到云端
      const { publishDps } = ty.device;
      if (!publishDps) {
        console.error('publishDps API 不可用');
        reject(new Error('publishDps API 不可用'));
        return;
      }

      const doPublish = () => {
        publishDps({
          deviceId: deviceId,
          dps: {
            [HISTORY_DP_ID]: dp112Value
          },
          mode: 2,
          pipelines: [1, 0, 3],
          success: (res) => resolve(res),
          fail: (error) => {
            const normalized = normalizePublishError(error);
            console.error('saveHistoryToCloud: publishDps 失败', {
              deviceId,
              dpId: HISTORY_DP_ID,
              dpValueLength: typeof dp112Value === 'string' ? dp112Value.length : -1,
              error: normalized
            });
            reject(normalized);
          }
        });
      };

      if (ty.device.getDeviceInfo) {
        ty.device.getDeviceInfo({
          deviceId,
          success: (info) => {
            if (!isDeviceReadyForPublish(info)) {
              reject({ errorCode: 'PRECHECK_BLOCK', errorMsg: 'device offline or bluetooth disconnected' });
              return;
            }
            doPublish();
          },
          fail: () => doPublish()
        });
      } else {
        doPublish();
      }
    } catch (error) {
      console.error('saveHistoryToCloud error:', error);
      reject(error);
    }
  });
}

/**
 * 从云端获取 DP 点 113 的历史记录日志
 * @param {String} deviceId - 设备 ID
 * @param {Object} options - 查询选项
 * @param {Number} options.offset - 偏移量，默认 0
 * @param {Number} options.limit - 每页数量，默认 50，最大 4000
 * @param {String} options.startTime - 开始时间（毫秒时间戳）
 * @param {String} options.endTime - 结束时间（毫秒时间戳）
 * @param {String} options.sortType - 排序方式：'DESC' 或 'ASC'，默认 'DESC'
 * @returns {Promise} Promise 对象，返回解析后的历史记录数组
 */
function getHistoryFromCloud(deviceId, options = {}) {
  return new Promise((resolve, reject) => {
    if (!deviceId) {
      reject(new Error('设备ID不能为空'));
      return;
    }

    const {
      offset = 0,
      limit = 50,
      startTime = '',
      endTime = '',
      sortType = 'DESC'
    } = options;

    // 确保 limit + offset <= 4000
    const maxLimit = Math.min(limit, 4000 - offset);
    if (maxLimit <= 0) {
      reject(new Error('offset + limit 不能超过 4000'));
      return;
    }

    console.log('从云端获取历史记录，参数:', { deviceId, offset, limit: maxLimit, startTime, endTime, sortType });

    // 使用统计接口获取 DP 点 113 的日志
    if (!commonApi || !commonApi.statApi) {
      console.warn('commonApi.statApi 不可用，无法从云端获取历史记录');
      reject(new Error('统计接口不可用，请确保已安装 @tuya/tuya-panel-api 并提交工单开通统计功能'));
      return;
    }

    commonApi.statApi
      .getLogInSpecifiedTime({
        devId: deviceId,
        dpIds: String(HISTORY_DP_ID),
        offset: offset,
        limit: maxLimit,
        startTime: startTime,
        endTime: endTime,
        sortType: 'ASC'
      })
      .then(response => {
        console.log('云端返回的原始数据:', response);
        
        if (!response || !response.dps || !Array.isArray(response.dps)) {
          console.warn('云端返回数据格式不正确');
          resolve([]);
          return;
        }

        // 解析每条日志记录
        const historyRecords = [];
        response.dps.forEach(dpLog => {
          try {
            // dpLog.value 是字符串，需要解析 JSON
            const valueStr = dpLog.value;
            if (typeof valueStr === 'string' && valueStr.trim()) {
              const parsedData = JSON.parse(valueStr);
              
              // 如果解析出的是数组，展开为多条记录
              if (Array.isArray(parsedData)) {
                parsedData.forEach(record => {
                  historyRecords.push({
                    ...record,
                    cloudTimestamp: dpLog.timeStamp,
                    cloudTimeStr: dpLog.timeStr
                  });
                });
              } else if (typeof parsedData === 'object') {
                // 单条记录
                historyRecords.push({
                  ...parsedData,
                  cloudTimestamp: dpLog.timeStamp,
                  cloudTimeStr: dpLog.timeStr
                });
              }
            }
          } catch (error) {
            console.warn('解析云端日志记录失败:', error, '原始数据:', dpLog);
          }
        });

        console.log('解析后的历史记录数量:', historyRecords.length);
        resolve({
          records: historyRecords,
          total: response.total || historyRecords.length,
          hasNext: response.hasNext || false
        });
      })
      .catch(error => {
        console.error('从云端获取历史记录失败:', error);
        reject(error);
      });
  });
}

/**
 * 获取 DP 点上报日志
 * @param {String} deviceId - 设备 ID
 * @param {Object} options - 查询选项
 * @param {Number} options.offset - 偏移量，默认 0
 * @param {Number} options.limit - 每页数量，默认 50，最大 4000
 * @param {String} options.sortType - 排序方式：'DESC' 或 'ASC'，默认 'DESC'
 * @returns {Promise} Promise 对象，返回解析后的历史记录数组
 */
function getDpReportLog(deviceId, options = {}) {
  return new Promise((resolve, reject) => {
    if (!deviceId) {
      reject(new Error('设备ID不能为空'));
      return;
    }

    const {
      offset = 0,
      limit = 50,
      sortType = 'DESC'
    } = options;

    // 确保 limit + offset <= 4000
    const maxLimit = Math.min(limit, 4000 - offset);
    if (maxLimit <= 0) {
      reject(new Error('offset + limit 不能超过 4000'));
      return;
    }

    console.log('获取 DP 点上报日志，参数:', { deviceId, offset, limit: maxLimit, sortType });

    // 使用统计接口获取 DP 点 113 的日志
    if (!commonApi || !commonApi.statApi) {
      console.warn('commonApi.statApi 不可用，无法获取 DP 点上报日志');
      reject(new Error('统计接口不可用，请确保已安装 @tuya/tuya-panel-api 并提交工单开通统计功能'));
      return;
    }

    commonApi.statApi
      .getDpReportLog({
        devId: deviceId,
        dpIds: String(HISTORY_DP_ID),
        offset: offset,
        limit: maxLimit,
        sortType: sortType
      })
      .then(response => {
        console.log('DP 点上报日志返回的原始数据:', response);
        
        if (!response || !response.dps || !Array.isArray(response.dps)) {
          console.warn('DP 点上报日志返回数据格式不正确');
          resolve({
            records: [],
            total: 0,
            hasNext: false
          });
          return;
        }

        // 解析每条日志记录
        const historyRecords = [];
        response.dps.forEach(dpLog => {
          try {
            // dpLog.value 是字符串，需要解析 JSON
            const valueStr = dpLog.value;
            if (typeof valueStr === 'string' && valueStr.trim()) {
              const parsedData = JSON.parse(valueStr);
              
              // 如果解析出的是数组，展开为多条记录
              if (Array.isArray(parsedData)) {
                parsedData.forEach(record => {
                  historyRecords.push({
                    ...record,
                    cloudTimestamp: dpLog.timeStamp,
                    cloudTimeStr: dpLog.timeStr
                  });
                });
              } else if (typeof parsedData === 'object') {
                // 单条记录
                historyRecords.push({
                  ...parsedData,
                  cloudTimestamp: dpLog.timeStamp,
                  cloudTimeStr: dpLog.timeStr
                });
              }
            }
          } catch (error) {
            console.warn('解析 DP 点上报日志记录失败:', error, '原始数据:', dpLog);
          }
        });

        console.log('解析后的历史记录数量:', historyRecords.length);
        resolve({
          records: historyRecords,
          total: response.total || historyRecords.length,
          hasNext: response.hasNext || false
        });
      })
      .catch(error => {
        console.error('获取 DP 点上报日志失败:', error);
        reject(error);
      });
  });
}

/**
 * 根据记录 ID 从云端查找历史记录
 * @param {String} deviceId - 设备 ID
 * @param {String|Number} recordId - 记录 ID
 * @returns {Promise} Promise 对象，返回匹配的记录或 null
 */
function findHistoryRecordFromCloud(deviceId, recordId) {
  return new Promise((resolve, reject) => {
    // 先获取最近的记录（最多100条）
    getHistoryFromCloud(deviceId, {
      offset: 0,
      limit: 100,
      sortType: 'DESC'
    })
      .then(result => {
        const { records } = result;
        const recordIdNum = typeof recordId === 'string' ? parseInt(recordId) : recordId;
        
        // 查找匹配的记录
        const matchedRecord = records.find(record => {
          const id = typeof record.id === 'string' ? parseInt(record.id) : record.id;
          return id === recordIdNum;
        });

        if (matchedRecord) {
          console.log('从云端找到匹配的记录:', matchedRecord);
          resolve(matchedRecord);
        } else {
          console.log('云端未找到匹配的记录，ID:', recordId);
          resolve(null);
        }
      })
      .catch(error => {
        console.error('查找云端历史记录失败:', error);
        reject(error);
      });
  });
}

// 导出函数
module.exports = {
  formatHistoryForDp112,
  formatTipsForDp113,
  saveHistoryToCloud,
  getHistoryFromCloud,
  getDpReportLog,
  findHistoryRecordFromCloud
};

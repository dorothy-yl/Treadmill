/**
 * 云端同步工具模块
 * 用于通过 DP 点 112 实现历史记录的云端同步
 */

// 尝试导入 commonApi，如果失败则使用备用方案
let commonApi = null;
try {
  const tuyaPanelApi = require('@tuya/tuya-panel-api');
  commonApi = tuyaPanelApi.commonApi;
} catch (error) {
  console.warn('无法导入 @tuya/tuya-panel-api，将使用备用方案:', error);
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
 * 将历史记录数组或单条记录格式化为 DP 点 112 需要的 JSON 字符串格式
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
    
    // 格式化每条记录，只保留必要字段
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
        // 处理load值：可能是字符串或数字，需要转换为数字
        let loadValue = 0;
        if (record.Load !== undefined) {
          loadValue = typeof record.Load === 'string' ? parseFloat(record.Load) || 0 : (record.Load || 0);
        } else if (record.load !== undefined) {
          loadValue = typeof record.load === 'string' ? parseFloat(record.load) || 0 : (record.load || 0);
        } else if (record.avgResistance !== undefined) {
          loadValue = typeof record.avgResistance === 'string' ? parseFloat(record.avgResistance) || 0 : (record.avgResistance || 0);
        }
        const distanceValue = parseFloat(record.distance || 0);
        const caloriesValue = parseInt(record.calories || 0);
        const rpmValue = parseInt(record.rpm || 0);
        const wattValue = parseFloat(record.watt || 0);
        const maxResistanceValue = parseInt(record.maxResistance || 0);
        const minResistanceValue = parseInt(record.minResistance || 0);
        const heartRateValue = parseInt(record.heartRate || 0);
        // 处理速度字段：支持 speed 和 speedKmh
        const speedValue = parseFloat(record.speed || record.speedKmh || 0);
        
        // 生成可读的显示文本，用于设备日志页面显示
        const displayText = [
          `运动时间：${formattedDuration}`,
          `阻力：${loadValue}`,
          `距离：${distanceValue.toFixed(2)}km`,
          `卡路里：${caloriesValue}kcal`,
          `RPM：${rpmValue}`,
          `功率：${wattValue}W`,
          `最大阻力：${maxResistanceValue}`,
          `最小阻力：${minResistanceValue}`,
          `心率：${heartRateValue}`,
          `速度：${speedValue}`,
          `标题：${record.pageTitle}`,
          `模式：${record.isGoalMode ? '目标模式' : '快速开始'}`
        ].join(' | ');
        
        const formattedRecord = {
          id: record.id || Date.now(),
          duration: durationSeconds, // 统一使用秒数
          date: record.date || record.dateFormatted || new Date().toISOString(),
          distance: distanceValue,
          calories: caloriesValue,
          load: loadValue,
          rpm: rpmValue,
          watt: wattValue,
          // 添加模式识别字段
          isGoalMode: record.isGoalMode === true,
          pageTitle: record.pageTitle || (record.isGoalMode ? 'Target pattern' : 'Quick Start'),
          // 添加其他可能需要的字段
          heartRate: heartRateValue,
          speed: speedValue,
          maxResistance: maxResistanceValue,
          minResistance: minResistanceValue,
        };
        
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
      console.log(`formatHistoryForDp112: 成功格式化 ${formattedRecords.length} 条记录，JSON长度: ${jsonString.length} 字节`);
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
 * 将历史记录通过 DP 点 112 上报到云端
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
      // 如果传入的是单条记录，需要先获取现有历史记录，然后合并
      let historyArray = [];
      if (Array.isArray(historyData)) {
        historyArray = historyData;
      } else {
        // 单条记录：从本地存储获取现有记录，将新记录添加到开头
        try {
          const existingHistory = ty.getStorageSync('exerciseHistory') || [];
          if (Array.isArray(existingHistory)) {
            historyArray = [historyData, ...existingHistory];
          } else {
            historyArray = [historyData];
          }
        } catch (error) {
          console.warn('获取本地历史记录失败，仅保存新记录:', error);
          historyArray = [historyData];
        }
      }

      // 限制记录数量，避免数据过大（最多保留最近100条）
      if (historyArray.length > 100) {
        historyArray = historyArray.slice(0, 100);
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
        console.log('✓ 数据格式验证通过，包含', parsed.length, '条记录');
      } catch (error) {
        console.error('saveHistoryToCloud: JSON格式验证失败:', error);
        reject(new Error('数据格式验证失败: ' + error.message));
        return;
      }
      
      console.log('=== 准备上报历史记录到云端 ===');
      console.log('设备ID:', deviceId);
      console.log('原始记录数量:', historyArray.length);
      console.log('格式化后数据大小:', dp112Value.length, '字节');
      console.log('DP点112数据预览 (前200字符):', dp112Value.substring(0, 200) + (dp112Value.length > 200 ? '...' : ''));
      console.log('完整JSON数据:', dp112Value);
      console.log('--- 数据格式说明 ---');
      console.log('1. 数据已格式化为JSON字符串数组');
      console.log('2. 设备端需要接收此数据并主动上报到云端');
      console.log('3. 设备端应使用涂鸦SDK的DP上报接口上报此JSON字符串');
      console.log('4. 上报时DP点112的值应该是字符串类型（JSON字符串）');

      // 通过 publishDps 下发到设备，设备需要主动上报到云端
      const { publishDps } = ty.device;
      if (!publishDps) {
        console.error('publishDps API 不可用');
        reject(new Error('publishDps API 不可用'));
        return;
      }

      console.log('开始调用 publishDps，下发DP点112数据到设备...');
      publishDps({
        deviceId: deviceId,
        dps: {
          112: dp112Value
        },
        mode: 2, // 自动选择最佳通道
        pipelines: [0, 1, 2, 3, 4, 5, 6], // 所有通道
        success: (res) => {
          console.log('✓ publishDps 调用成功，数据已下发到设备');
          console.log('响应数据:', JSON.stringify(res));
          console.log('--- 重要提示 ---');
          console.log('1. 数据已成功下发到设备端');
          console.log('2. 设备端需要监听DP点112的下发事件');
          console.log('3. 设备端接收到数据后，应主动调用上报接口将数据上报到云端');
          console.log('4. 请检查设备端固件是否正确实现了上报逻辑');
          console.log('5. 请在涂鸦开发者平台的设备日志页面查看DP点112的上报记录');
          resolve(res);
        },
        fail: (error) => {
          console.error('✗ publishDps 调用失败:');
          console.error('错误详情:', JSON.stringify(error));
          console.error('错误消息:', error.errorMsg || error.message || error);
          console.error('错误代码:', error.errorCode || error.code);
          reject(error);
        }
      });
    } catch (error) {
      console.error('saveHistoryToCloud error:', error);
      reject(error);
    }
  });
}

/**
 * 从云端获取 DP 点 112 的历史记录日志
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

    // 使用统计接口获取 DP 点 112 的日志
    if (!commonApi || !commonApi.statApi) {
      console.warn('commonApi.statApi 不可用，无法从云端获取历史记录');
      reject(new Error('统计接口不可用，请确保已安装 @tuya/tuya-panel-api 并提交工单开通统计功能'));
      return;
    }

    commonApi.statApi
      .getLogInSpecifiedTime({
        devId: deviceId,
        dpIds: '112',
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

    // 使用统计接口获取 DP 点 112 的日志
    if (!commonApi || !commonApi.statApi) {
      console.warn('commonApi.statApi 不可用，无法获取 DP 点上报日志');
      reject(new Error('统计接口不可用，请确保已安装 @tuya/tuya-panel-api 并提交工单开通统计功能'));
      return;
    }

    commonApi.statApi
      .getDpReportLog({
        devId: deviceId,
        dpIds: '112',
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


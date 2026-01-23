// 导入 I18n（如果全局 I18n 未定义，则从工具类导入）
const I18nUtil = require('../../utils/i18n.js');
// 使用全局 I18n 或工具类实例
const I18n = global.I18n || I18nUtil;

// 导入云端同步工具
const { getHistoryFromCloud } = require('../../utils/cloudSync.js');

Page({
  data: {
    currentDate: '',
    currentDateObj: null,
    selectedDateStr: '', // YYYY-MM-DD format for filtering
    records: [],
    showCalendar: false,
    // Calendar data
    calendarCurrentDate: new Date(),
    calendarDays: [],
    // 星期名称（初始化为空数组，在 onLoad 中根据系统语言设置）
    weekdays: [],
    currentMonthText: '',
    cloudRecords: [], // 存储从云端获取的所有记录
    isLoading: false, // 加载状态
    isRefreshing: false, // 下拉刷新状态
    // 国际化文本（初始化为空，在 onLoad 中根据系统语言设置）
    sportsRecordsLabel: '',
    workoutRecordsLabel: '',
    noRecordsTodayLabel: '',
    hrBpmLabel: '',
    inclineLabel: '',
    distanceKmLabel: ''
  },

  /**
   * 获取 I18n 实例的辅助方法
   */
  getI18n() {
    return global.I18n || I18nUtil;
  },
  
  onLoad() {
    // 确保 I18n 已初始化
    const currentI18n = this.getI18n();
    
    ty.hideMenuButton({ success: () => {
      console.log('hideMenuButton success');
    }, fail: (error) => {
      console.log('hideMenuButton fail', error);
    } });
    
    const { query: { deviceId } } = ty.getLaunchOptionsSync();
    this.deviceId = deviceId;
    
    console.log('History Page Load');
    // 初始化当前日期为今天
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    this.setData({
      currentDateObj: today.getTime(),
      selectedDateStr: this.formatDateString(today),
      // 根据系统语言初始化星期名称
      weekdays: [
        currentI18n.t('week_sunday'),
        currentI18n.t('week_monday'),
        currentI18n.t('week_tuesday'),
        currentI18n.t('week_wednesday'),
        currentI18n.t('week_thursday'),
        currentI18n.t('week_friday'),
        currentI18n.t('week_saturday')
      ],
      // 初始化国际化文本
      sportsRecordsLabel: currentI18n.t('sports_records'),
      workoutRecordsLabel: currentI18n.t('workout_records'),
      noRecordsTodayLabel: currentI18n.t('no_records_today'),
      hrBpmLabel: currentI18n.t('hr_bpm'),
      inclineLabel: currentI18n.t('incline'),
      distanceKmLabel: currentI18n.t('distance_km_simple')
    });
    this.updateDateDisplay(today);
    this.generateCalendar();
    
    // 从云端加载数据
    this.loadRecordsFromCloud();
  },

  onShow() {
    // 每次显示页面时重新从云端加载数据
    if (this.deviceId) {
      this.loadRecordsFromCloud();
    } else {
      const selectedDate = new Date(this.data.currentDateObj);
      this.loadRecordsForDate(selectedDate);
    }
  },

  // 下拉刷新
  onRefresherRefresh() {
    console.log('下拉刷新 history 页面');
    this.setData({ isRefreshing: true });
    if (this.deviceId) {
      // 从云端加载数据
      this.setData({ isLoading: true });

      // 优先使用 ty.getAnalyticsLogsPublishLog API
      if (ty.getAnalyticsLogsPublishLog) {
        ty.getAnalyticsLogsPublishLog({
          devId: this.deviceId,
          dpIds: '112',
          offset: 0,
          limit: 100,
        })
          .then((response) => {
            console.log('✓ 从日志接口获取历史记录成功（下拉刷新）');
            console.log('云端返回的原始数据（下拉刷新）:', response);
            
            // 解析日志数据
            const allRecords = this.parseHistoryFromLogs(response);
            
            console.log('解析后的历史记录数量（下拉刷新）:', allRecords.length);
            
            this.setData({
              cloudRecords: allRecords,
              isLoading: false
            });
            
            // 加载当前日期的记录
            const selectedDate = new Date(this.data.currentDateObj);
            this.loadRecordsForDate(selectedDate);
            
            // 如果日历已打开，重新生成日历以更新标记
            if (this.data.showCalendar) {
              this.generateCalendar();
            }
            
            // 刷新完成后停止下拉刷新动画
            this.setData({ isRefreshing: false });
          })
          .catch((error) => {
            console.error('从日志接口获取数据失败（下拉刷新）:', error);
            // 降级到使用 cloudSync.js 的方法
            this.loadRecordsFromCloudFallbackForRefresh();
          });
      } else {
        // 如果 API 不可用，使用降级方案
        this.loadRecordsFromCloudFallbackForRefresh();
      }
    } else {
      // 如果没有设备ID，从本地加载
      const selectedDate = new Date(this.data.currentDateObj);
      this.loadRecordsForDateFromLocal(selectedDate);
      
      // 如果日历已打开，重新生成日历以更新标记
      if (this.data.showCalendar) {
        this.generateCalendar();
      }
      
      // 刷新完成后停止下拉刷新动画
      this.setData({ isRefreshing: false });
    }
  },

  // 下拉刷新时的降级方案
  loadRecordsFromCloudFallbackForRefresh() {
    getHistoryFromCloud(this.deviceId, {
      offset: 0,
      limit: 100,
      sortType: 'DESC'
    })
      .then((result) => {
        console.log('使用降级方案获取云端数据（下拉刷新）:', result);
        
        const allRecords = result.records || [];
        
        this.setData({
          cloudRecords: allRecords,
          isLoading: false
        });
        
        const selectedDate = new Date(this.data.currentDateObj);
        this.loadRecordsForDate(selectedDate);
        
        if (this.data.showCalendar) {
          this.generateCalendar();
        }
        
        this.setData({ isRefreshing: false });
      })
      .catch((error) => {
        console.error('从云端获取数据失败（下拉刷新）:', error);
        this.setData({
          isLoading: false
        });
        // 如果云端获取失败，降级到本地存储
        const selectedDate = new Date(this.data.currentDateObj);
        this.loadRecordsForDateFromLocal(selectedDate);
        
        if (this.data.showCalendar) {
          this.generateCalendar();
        }
        
        this.setData({ isRefreshing: false });
      });
  },

  // 格式化日期为 YYYY-MM-DD 字符串
  formatDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  // 格式化日期为显示格式 "12月29日" (中文) 或 "Dec 29" (英文)
  formatDateDisplay(date) {
    const monthKeys = [
      'month_january_short', 'month_february_short', 'month_march_short', 'month_april_short',
      'month_may_short', 'month_june_short', 'month_july_short', 'month_august_short',
      'month_september_short', 'month_october_short', 'month_november_short', 'month_december_short'
    ];
    const month = date.getMonth();
    const day = date.getDate();
    const monthText = this.getI18n().t(monthKeys[month]);
    // 检查翻译后的文本是否包含"月"字来判断是否为中文
    const isChinese = monthText.includes('月');
    if (isChinese) {
      return `${monthText}${day}日`;
    } else {
      return `${monthText} ${day}`;
    }
  },

  // 格式化日期时间为 "12月11日12:01:03" 格式 (中文) 或 "2025.10.05 12:01:03" 格式 (英文)
  formatDateTime(date) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    const monthKeys = [
      'month_january_short', 'month_february_short', 'month_march_short', 'month_april_short',
      'month_may_short', 'month_june_short', 'month_july_short', 'month_august_short',
      'month_september_short', 'month_october_short', 'month_november_short', 'month_december_short'
    ];
    const monthText = this.getI18n().t(monthKeys[date.getMonth()]);
    // 检查翻译后的文本是否包含"月"字来判断是否为中文
    const isChinese = monthText.includes('月');
    if (isChinese) {
      return `${monthText}${day}日${hours}:${minutes}:${seconds}`;
    } else {
      const monthStr = month.toString().padStart(2, '0');
      const dayStr = day.toString().padStart(2, '0');
      return `${year}.${monthStr}.${dayStr} ${hours}:${minutes}:${seconds}`;
    }
  },

  // 将 ISO 格式字符串转换为友好的显示格式
  formatDateStringForDisplay(dateString) {
    if (!dateString || typeof dateString !== 'string') {
      return dateString;
    }
    
    // 检测是否为 ISO 格式（包含 'T' 和 'Z' 或时区信息）
    const isISOFormat = dateString.includes('T') && (dateString.includes('Z') || dateString.match(/[+-]\d{2}:\d{2}$/));
    
    if (isISOFormat) {
      try {
        // 解析 ISO 格式字符串并转换为本地时间
        const date = new Date(dateString);
        // 检查日期是否有效
        if (isNaN(date.getTime())) {
          return dateString; // 如果解析失败，返回原字符串
        }
        return this.formatDateTime(date);
      } catch (error) {
        console.warn('formatDateStringForDisplay: 解析日期失败', error, dateString);
        return dateString; // 如果解析失败，返回原字符串
      }
    }
    
    // 如果不是 ISO 格式，直接返回原字符串
    return dateString;
  },

  // 格式化时长为 "HH:MM:SS" 格式
  formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    const h = hours.toString().padStart(2, '0');
    const m = minutes.toString().padStart(2, '0');
    const s = secs.toString().padStart(2, '0');
    
    return `${h}:${m}:${s}`;
  },

  // 从 ISO 字符串或 Date 对象中提取日期字符串
  getDateStringFromRecord(record) {
    if (!record || !record.date) return '';
    
    const dateValue = record.date;
    
    // 如果已经是 YYYY-MM-DD 格式的字符串，直接返回
    if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
      return dateValue;
    }
    
    // 如果是 ISO 字符串（如 "2025-12-05T15:23:00.000Z"），直接提取前10个字符（YYYY-MM-DD）
    if (typeof dateValue === 'string' && dateValue.includes('T')) {
      const datePart = dateValue.substring(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
        return datePart;
      }
    }
    
    // 如果是 Date 对象或其他格式，尝试解析并使用 UTC 方法避免时区问题
    try {
      const date = new Date(dateValue);
      if (isNaN(date.getTime())) return '';
      
      // 使用 UTC 方法提取日期，避免时区转换问题
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, '0');
      const day = String(date.getUTCDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    } catch (error) {
      console.error('Error parsing date:', error);
      return '';
    }
  },

  // 更新日期显示
  updateDateDisplay(date) {
    this.setData({
      currentDate: this.formatDateDisplay(date),
      currentDateObj: date.getTime(),
      selectedDateStr: this.formatDateString(date)
    });
  },

  // 从云端加载所有历史记录
  loadRecordsFromCloud() {
    if (!this.deviceId) {
      console.error('设备ID不存在');
      // 降级到本地存储
      const selectedDate = new Date(this.data.currentDateObj);
      this.loadRecordsForDateFromLocal(selectedDate);
      return;
    }

    this.setData({ isLoading: true });

    // 优先使用 ty.getAnalyticsLogsPublishLog API 获取指令下发日志
    if (ty.getAnalyticsLogsPublishLog) {
      ty.getAnalyticsLogsPublishLog({
        devId: this.deviceId,
        dpIds: '112',
        offset: 0,
        limit: 100, // 可以根据需要调整，最大4000
      })
        .then((response) => {
          console.log('✓ 从日志接口获取历史记录成功');
          console.log('云端返回的原始数据:', response);
          
          // 解析日志数据
          const allRecords = this.parseHistoryFromLogs(response);
          
          console.log('解析后的历史记录数量:', allRecords.length);
          
          this.setData({
            cloudRecords: allRecords,
            isLoading: false
          });
          
          // 加载当前日期的记录
          const selectedDate = new Date(this.data.currentDateObj);
          this.loadRecordsForDate(selectedDate);
          
          // 如果日历已打开，重新生成日历以更新标记
          if (this.data.showCalendar) {
            this.generateCalendar();
          }
        })
        .catch((error) => {
          console.error('从日志接口获取数据失败:', error);
          // 降级到使用 cloudSync.js 的方法
          this.loadRecordsFromCloudFallback();
        });
    } else {
      // 如果 API 不可用，使用降级方案
      this.loadRecordsFromCloudFallback();
    }
  },

  // 降级方案：使用 cloudSync.js 的 getHistoryFromCloud 方法
  loadRecordsFromCloudFallback() {
    getHistoryFromCloud(this.deviceId, {
      offset: 0,
      limit: 100,
      sortType: 'DESC'
    })
      .then((result) => {
        console.log('使用降级方案获取云端数据:', result);
        
        const allRecords = result.records || [];
        
        this.setData({
          cloudRecords: allRecords,
          isLoading: false
        });
        
        const selectedDate = new Date(this.data.currentDateObj);
        this.loadRecordsForDate(selectedDate);
        
        if (this.data.showCalendar) {
          this.generateCalendar();
        }
      })
      .catch((error) => {
        console.error('从云端获取数据失败:', error);
        this.setData({
          isLoading: false
        });
        // 如果云端获取失败，降级到本地存储
        const selectedDate = new Date(this.data.currentDateObj);
        this.loadRecordsForDateFromLocal(selectedDate);
      });
  },

  // 解析云端返回的日志数据（从 ty.getAnalyticsLogsPublishLog API）
  parseHistoryFromLogs(response) {
    const allRecords = [];
    
    try {
      if (!response) {
        console.warn('云端返回数据为空');
        return [];
      }

      // 如果 response 是数组，直接遍历
      // 如果 response 有 data 或 list 字段，使用该字段
      let logItems = [];
      if (Array.isArray(response)) {
        logItems = response;
      } else if (response.data && Array.isArray(response.data)) {
        logItems = response.data;
      } else if (response.list && Array.isArray(response.list)) {
        logItems = response.list;
      } else if (response.dps && Array.isArray(response.dps)) {
        logItems = response.dps;
      } else {
        console.warn('云端返回数据格式不正确，无法找到数组字段');
        console.log('响应数据结构:', Object.keys(response || {}));
        return [];
      }

      console.log('找到', logItems.length, '条日志记录');

      logItems.forEach((logItem, index) => {
        try {
          // 从"事件详情"字段中提取 JSON 数据
          // 根据设备日志截图，优先检查"事件详情"字段（中文）
          let historyData = null;
          
          // 优先检查"事件详情"字段（根据截图，这是主要字段）
          if (logItem['事件详情'] !== undefined && logItem['事件详情'] !== null) {
            const eventDetail = logItem['事件详情'];
            if (typeof eventDetail === 'string' && eventDetail.trim()) {
              try {
                historyData = JSON.parse(eventDetail);
                console.log(`解析"事件详情"成功 (记录${index}):`, historyData);
              } catch (parseError) {
                console.warn(`解析"事件详情"JSON失败 (记录${index}):`, parseError);
                console.warn('原始数据:', eventDetail);
              }
            } else {
              historyData = eventDetail;
            }
          } else if (logItem.eventDetail !== undefined && logItem.eventDetail !== null) {
            historyData = typeof logItem.eventDetail === 'string' 
              ? JSON.parse(logItem.eventDetail) 
              : logItem.eventDetail;
          } else if (logItem.value !== undefined && logItem.value !== null) {
            historyData = typeof logItem.value === 'string' 
              ? JSON.parse(logItem.value) 
              : logItem.value;
          } else if (logItem.dpValue !== undefined && logItem.dpValue !== null) {
            historyData = typeof logItem.dpValue === 'string' 
              ? JSON.parse(logItem.dpValue) 
              : logItem.dpValue;
          } else if (logItem.detail !== undefined && logItem.detail !== null) {
            historyData = typeof logItem.detail === 'string' 
              ? JSON.parse(logItem.detail) 
              : logItem.detail;
          }

          // 处理解析出的数据，确保格式正确
          const processRecord = (record) => {
            if (!record || !record.id) {
              return null;
            }

            // 使用云端时间或记录中的时间
            const cloudTime = logItem['时间(GMT+8)'] || logItem.time || logItem.timeStr || logItem.timestamp;
            
            // 确保日期字段存在
            if (!record.date && cloudTime) {
              try {
                // 尝试解析云端时间字符串
                const dateObj = new Date(cloudTime);
                if (!isNaN(dateObj.getTime())) {
                  record.date = dateObj.toISOString();
                }
              } catch (error) {
                console.warn('解析云端时间失败:', error);
              }
            }

            // 返回格式化的记录对象
            return {
              ...record,
              cloudTime: cloudTime,
              cloudTimestamp: logItem.timestamp || logItem.timeStamp
            };
          };

          // 如果 historyData 是数组，展开为多条记录
          if (Array.isArray(historyData)) {
            historyData.forEach(record => {
              const processedRecord = processRecord(record);
              if (processedRecord) {
                allRecords.push(processedRecord);
              }
            });
          } else if (historyData && typeof historyData === 'object' && historyData.id) {
            // 单条记录
            const processedRecord = processRecord(historyData);
            if (processedRecord) {
              allRecords.push(processedRecord);
            }
          }
        } catch (error) {
          console.warn(`解析第 ${index} 条日志记录失败:`, error, logItem);
        }
      });

      console.log(`成功解析 ${allRecords.length} 条云端历史记录`);
      return allRecords;
    } catch (error) {
      console.error('解析云端数据失败:', error);
      return [];
    }
  },

  // 根据日期加载记录（从云端数据中筛选）
  loadRecordsForDate(date) {
    try {
      const cloudRecords = this.data.cloudRecords || [];
      const targetDateStr = this.formatDateString(date);
      
      // 筛选出当天的记录
      const dayRecords = cloudRecords.filter(record => {
        const recordDateStr = this.getDateStringFromRecord(record);
        return recordDateStr === targetDateStr;
      });
      
      // 格式化记录以匹配页面显示需求
      const formattedRecords = dayRecords.map(record => {
        // 将duration从秒转换为 "HH:MM:SS" 格式
        const durationFormatted = this.formatTime(record.duration || 0);
        
        // 格式化日期字段（处理 ISO 格式）
        const rawDate = record.dateFormatted || record.date;
        const formattedDate = this.formatDateStringForDisplay(rawDate);
        
        // 根据模式确定标题，确保总是使用翻译后的值
        let title = record.pageTitle;
        if (!title || title === 'quick_start' || title === 'target_pattern') {
          // 如果 title 是键名而不是翻译后的值，进行翻译
          if (title === 'quick_start' || (!record.pageTitle && !record.isGoalMode)) {
            title = this.getI18n().t('quick_start');
          } else if (title === 'target_pattern' || record.isGoalMode) {
            title = this.getI18n().t('target_pattern');
          } else {
            title = record.isGoalMode ? this.getI18n().t('target_pattern') : this.getI18n().t('quick_start');
          }
        }
        
        // 调试：检查模式信息
        if (!record.pageTitle && record.isGoalMode === undefined) {
          console.log('警告：记录缺少模式信息，使用默认值 "Quick Start"', record.id);
        }
        
        return {
          id: record.id,
          duration: durationFormatted,
          date: formattedDate,
          title: title, // 添加标题字段
          speed: record.speedKmh ? record.speedKmh.toFixed(2) : (record.speed ? record.speed.toFixed(2) : '0.00'),
          calories: Math.round(record.calories || 0).toString(),
          distance: record.distance ? record.distance.toFixed(1) : '0.0',
          Load: record.load ? record.load.toString() : (record.avgResistance ? Math.round(record.avgResistance).toString() : '0'),
          resistance: record.avgResistance ? record.avgResistance.toFixed(1) : (record.maxResistance ? record.maxResistance.toFixed(1) : '0.0'),
          // 添加三个数据显示字段
          heartRate: record.heartRate ? Math.round(record.heartRate).toString() : '0',
          incline: record.incline ? Math.round(record.incline).toString() : (record.avgResistance ? Math.round(record.avgResistance).toString() : '0'),
          // 保存完整数据用于详情页
          fullRecord: record
        };
      });
      
      // 按时间排序（最新的在前）
      formattedRecords.sort((a, b) => {
        const dateA = new Date(a.fullRecord.date || 0).getTime();
        const dateB = new Date(b.fullRecord.date || 0).getTime();
        return dateB - dateA;
      });
      
      this.setData({
        records: formattedRecords
      });
    } catch (error) {
      console.error('Error loading records:', error);
      this.setData({
        records: []
      });
    }
  },

  // 从本地存储加载记录（作为降级方案）
  loadRecordsForDateFromLocal(date) {
    try {
      const history = ty.getStorageSync('exerciseHistory') || [];
      const targetDateStr = this.formatDateString(date);
      
      // 筛选出当天的记录
      const dayRecords = history.filter(record => {
        const recordDateStr = this.getDateStringFromRecord(record);
        return recordDateStr === targetDateStr;
      });
      
      // 格式化记录以匹配页面显示需求
      const formattedRecords = dayRecords.map(record => {
        // 将duration从秒转换为 "HH:MM:SS" 格式
        const durationFormatted = this.formatTime(record.duration || 0);
        
        // 格式化日期字段（处理 ISO 格式）
        const rawDate = record.dateFormatted || record.date;
        const formattedDate = this.formatDateStringForDisplay(rawDate);
        
        // 根据模式确定标题，确保总是使用翻译后的值
        let title = record.pageTitle;
        if (!title || title === 'quick_start' || title === 'target_pattern') {
          // 如果 title 是键名而不是翻译后的值，进行翻译
          if (title === 'quick_start' || (!record.pageTitle && !record.isGoalMode)) {
            title = this.getI18n().t('quick_start');
          } else if (title === 'target_pattern' || record.isGoalMode) {
            title = this.getI18n().t('target_pattern');
          } else {
            title = record.isGoalMode ? this.getI18n().t('target_pattern') : this.getI18n().t('quick_start');
          }
        }
        return {
          id: record.id,
          duration: durationFormatted,
          date: formattedDate,
          title: title,
          speed: record.speedKmh ? record.speedKmh.toFixed(2) : (record.speed ? record.speed.toFixed(2) : '0.00'),
          calories: Math.round(record.calories).toString(),
          distance: record.distance ? record.distance.toFixed(1) : '0.0',
          Load: record.load ? record.load.toString() : (record.avgResistance ? Math.round(record.avgResistance).toString() : '0'),
          resistance: record.avgResistance ? record.avgResistance.toFixed(1) : (record.maxResistance ? record.maxResistance.toFixed(1) : '0.0'),
          // 添加三个数据显示字段
          heartRate: record.heartRate ? Math.round(record.heartRate).toString() : '0',
          incline: record.incline ? Math.round(record.incline).toString() : (record.avgResistance ? Math.round(record.avgResistance).toString() : '0'),
          pageTitle: record.pageTitle || (record.isGoalMode ? this.getI18n().t('target_pattern') : this.getI18n().t('quick_start')),
          isGoalMode: record.isGoalMode,
          // 保存完整数据用于详情页
          fullRecord: record
        };
      });
      
      // 按时间排序（最新的在前）
      formattedRecords.sort((a, b) => {
        const dateA = new Date(a.fullRecord.date || 0).getTime();
        const dateB = new Date(b.fullRecord.date || 0).getTime();
        return dateB - dateA;
      });
      
      this.setData({
        records: formattedRecords
      });
    } catch (error) {
      console.error('Error loading records from local:', error);
      this.setData({
        records: []
      });
    }
  },

  prevDate() {
    const currentDate = new Date(this.data.currentDateObj);
    const prevDate = new Date(currentDate);
    prevDate.setDate(prevDate.getDate() - 1);
    prevDate.setHours(0, 0, 0, 0);
    this.updateDateDisplay(prevDate);
    this.loadRecordsForDate(prevDate);
  },

  nextDate() {
    const currentDate = new Date(this.data.currentDateObj);
    const nextDate = new Date(currentDate);
    nextDate.setDate(nextDate.getDate() + 1);
    nextDate.setHours(0, 0, 0, 0);
    this.updateDateDisplay(nextDate);
    this.loadRecordsForDate(nextDate);
  },

  // 显示日历弹窗
  showCalendar() {
    // 设置日历显示为当前选择的日期所在月份
    const selectedDate = new Date(this.data.currentDateObj);
    this.setData({
      showCalendar: true,
      calendarCurrentDate: new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1)
    });
    this.generateCalendar();
  },

  // 隐藏日历弹窗
  hideCalendar() {
    this.setData({
      showCalendar: false
    });
  },

  // 从日历选择日期
  selectDateFromCalendar(e) {
    const dateStr = e.currentTarget.dataset.date;
    if (!dateStr) return;
    
    const selectedDate = new Date(dateStr);
    selectedDate.setHours(0, 0, 0, 0);
    
    this.updateDateDisplay(selectedDate);
    this.loadRecordsForDate(selectedDate);
    this.hideCalendar();
  },

  // 检查指定日期是否有历史记录
  checkDateHasRecord(dateStr) {
    try {
      // 优先检查云端记录
      const cloudRecords = this.data.cloudRecords || [];
      if (cloudRecords.length > 0) {
        const hasRecord = cloudRecords.some(record => {
          const recordDateStr = this.getDateStringFromRecord(record);
          return recordDateStr === dateStr;
        });
        if (hasRecord) return true;
      }

      // 降级到本地存储
      const history = ty.getStorageSync('exerciseHistory') || [];
      if (Array.isArray(history) && history.length > 0) {
        const hasRecord = history.some(record => {
          const recordDateStr = this.getDateStringFromRecord(record);
          return recordDateStr === dateStr;
        });
        if (hasRecord) return true;
      }

      return false;
    } catch (error) {
      console.error('Error checking date has record:', error);
      return false;
    }
  },

  // 生成日历
  generateCalendar() {
    const { calendarCurrentDate, selectedDateStr } = this.data;
    const year = calendarCurrentDate.getFullYear();
    const month = calendarCurrentDate.getMonth();
    
    const monthKeys = [
      'month_january', 'month_february', 'month_march', 'month_april',
      'month_may', 'month_june', 'month_july', 'month_august',
      'month_september', 'month_october', 'month_november', 'month_december'
    ];
    const monthText = `${this.getI18n().t(monthKeys[month])} ${year}`;
    this.setData({ currentMonthText: monthText });

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startWeekday = firstDay.getDay();

    const prevMonthLastDay = new Date(year, month, 0).getDate();
    const calendarDays = [];

    // 上个月的日期
    for (let i = startWeekday - 1; i >= 0; i--) {
      const day = prevMonthLastDay - i;
      const date = new Date(year, month - 1, day);
      const dateStr = this.formatDateString(date);
      calendarDays.push({
        day: day,
        date: dateStr,
        isCurrentMonth: false,
        isToday: false,
        isSelected: dateStr === selectedDateStr,
        hasRecord: this.checkDateHasRecord(dateStr)
      });
    }

    // 当前月的日期
    const today = new Date();
    const todayStr = this.formatDateString(today);
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dateStr = this.formatDateString(date);
      calendarDays.push({
        day: day,
        date: dateStr,
        isCurrentMonth: true,
        isToday: dateStr === todayStr,
        isSelected: dateStr === selectedDateStr,
        hasRecord: this.checkDateHasRecord(dateStr)
      });
    }

    // 下个月的日期（填满42个格子）
    const remainingCells = 42 - calendarDays.length;
    for (let day = 1; day <= remainingCells; day++) {
      const date = new Date(year, month + 1, day);
      const dateStr = this.formatDateString(date);
      calendarDays.push({
        day: day,
        date: dateStr,
        isCurrentMonth: false,
        isToday: false,
        isSelected: dateStr === selectedDateStr,
        hasRecord: this.checkDateHasRecord(dateStr)
      });
    }

    this.setData({ calendarDays });
  },

  // 日历月份切换
  prevMonth() {
    const { calendarCurrentDate } = this.data;
    const newDate = new Date(calendarCurrentDate.getFullYear(), calendarCurrentDate.getMonth() - 1, 1);
    this.setData({ calendarCurrentDate: newDate });
    this.generateCalendar();
  },

  nextMonth() {
    const { calendarCurrentDate } = this.data;
    const newDate = new Date(calendarCurrentDate.getFullYear(), calendarCurrentDate.getMonth() + 1, 1);
    this.setData({ calendarCurrentDate: newDate });
    this.generateCalendar();
  },

  goToHome() {
    ty.navigateBack({
      delta: 1
    });
  },

  goToHistory() {
    // Already here
  },

  goToSettings() {
    ty.navigateTo({
      url: '/pages/congrats/congrats'
    });
  },

  goToDetail(e) {
    const id = e.currentTarget.dataset.id;
    const record = this.data.records.find(item => item.id === id);
    
    if (record && record.fullRecord) {
      const fullRecord = record.fullRecord;
      // 确定标题，优先使用 pageTitle，其次根据 isGoalMode 判断
      const title = fullRecord.pageTitle || (fullRecord.isGoalMode === true ? this.getI18n().t('target_pattern') : this.getI18n().t('quick_start'));
      
      const params = new URLSearchParams({
        id: id.toString(),
        duration: fullRecord.duration ? fullRecord.duration.toString() : '0',
        date: fullRecord.dateFormatted || fullRecord.date || '',
        speed: fullRecord.speedKmh ? fullRecord.speedKmh.toString() : (fullRecord.speed ? fullRecord.speed.toString() : '0'),
        calories: fullRecord.calories ? fullRecord.calories.toString() : '0',
        distance: fullRecord.distance ? fullRecord.distance.toFixed(1) : '0.0',
        incline: fullRecord.incline ? fullRecord.incline.toString() : (fullRecord.avgResistance ? Math.round(fullRecord.avgResistance).toString() : '0'),
        Load: fullRecord.load ? fullRecord.load.toString() : (fullRecord.avgResistance ? Math.round(fullRecord.avgResistance).toString() : '0'),
        maxResistance: fullRecord.maxResistance ? fullRecord.maxResistance.toString() : '0',
        minResistance: fullRecord.minResistance ? fullRecord.minResistance.toString() : '0',
        heartRate: fullRecord.heartRate ? fullRecord.heartRate.toString() : '0',
        title: title
      });
      
      ty.navigateTo({
        url: `/pages/history-detail/history-detail?${params.toString()}`
      });
    }
  },

  goBack() {
    try {
      ty.navigateBack({
        delta: 1,
        success: () => {
          console.log('返回成功');
        },
        fail: (err) => {
          console.error('返回失败:', err);
          // 如果返回失败，尝试跳转到首页
          ty.navigateTo({
            url: '/pages/index/index'
          });
        }
      });
    } catch (error) {
      console.error('返回异常:', error);
      // 如果出现异常，尝试跳转到首页
      ty.navigateTo({
        url: '/pages/index/index'
      });
    }
  },

  // 阻止事件冒泡（用于日历弹窗内容区域）
  stopPropagation() {
    // 空函数，仅用于阻止事件冒泡
  }
});

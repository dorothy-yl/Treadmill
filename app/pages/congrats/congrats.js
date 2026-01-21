// 导入 I18n（如果全局 I18n 未定义，则从工具类导入）
const I18nUtil = require('../../utils/i18n.js');
// 使用全局 I18n 或工具类实例
const I18n = global.I18n || I18nUtil;

Page({
  data: {
    userName: 'lucy',
    date: '2025/12/06',
    caloriesBurned: 128,
    duration: '18:24',
    rpm: '61',
    avgSpeed: '1.3',
    watt: '152',
    distance: '2.37',
    // 国际化文本（初始化为空，在 onLoad 中根据系统语言设置）
    pageTitle: '',
    kcalUnit: '',
    burnCaloriesLabel: '',
    totalDurationLabel: '',
    rpmLabel: '',
    speedLabel: '',
    powerLabel: '',
    distanceLabel: ''
  },
  onLoad(options) {
    // 确保 I18n 已初始化（如果全局未定义，使用工具类实例）
    const currentI18n = global.I18n || I18nUtil;
    
    // 根据系统语言初始化国际化文本
    this.setData({
      pageTitle: currentI18n.t('congratulations'),
      kcalUnit: currentI18n.t('kcal'),
      burnCaloriesLabel: currentI18n.t('burn_calories'),
      totalDurationLabel: currentI18n.t('total_duration'),
      rpmLabel: currentI18n.t('rpm'),
      speedLabel: currentI18n.t('speed_kmh_label'),
      powerLabel: currentI18n.t('power_w_label'),
      distanceLabel: currentI18n.t('distance_km_label')
    });
    ty.hideMenuButton({ success: () => {
      console.log('hideMenuButton success');
    }, fail: (error) => {
      console.log('hideMenuButton fail', error);
    } });
    let exerciseData = null;
    
    // 优先从URL参数获取数据
    if (options.id) {
      exerciseData = {
        id: options.id,
        duration: parseInt(options.duration) || 0,
        speed: parseFloat(options.speed) || 0,
        speedKmh: parseFloat(options.speedKmh) || 0,
        calories: parseFloat(options.calories) || 0,
        distance: parseFloat(options.distance) || 0.00,
        rpm: parseFloat(options.rpm) || 0,
        watt: parseFloat(options.watt) || 0,
        dateCongrats: options.dateCongrats || ''
      };
    } else {
      // 如果没有URL参数，从storage获取最新记录
      const history = ty.getStorageSync('exerciseHistory') || [];
      if (history.length > 0) {
        exerciseData = history[0]; // 最新的记录
      }
    }
    
    if (exerciseData) {
      // 格式化时间：从秒转换为 "HH:MM:SS"
      const formatTime = (seconds) => {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        const h = hours.toString().padStart(2, '0');
        const m = minutes.toString().padStart(2, '0');
        const s = secs.toString().padStart(2, '0');
        return `${h}:${m}:${s}`;
      };
      
      // 获取用户名（可以从storage获取或使用默认值）
      const userName = ty.getStorageSync('userName') || 'Dkkd';
      
      // 格式化数据
      const durationFormatted = exerciseData.durationFormatted || formatTime(exerciseData.duration);
      const caloriesBurned = Math.round(exerciseData.calories);
      const rpm = exerciseData.rpm ? exerciseData.rpm : '0';
      const distance = exerciseData.distance ? exerciseData.distance.toFixed(2) : '0.00';
      
      // 优先使用传递的speed值，如果没有则使用speedKmh，最后才计算平均速度
      const durationInHours = exerciseData.duration > 0 ? exerciseData.duration / 3600 : 0;
      let avgSpeed = '0.0';
      if (exerciseData.speed && exerciseData.speed > 0) {
        // 优先使用传递的speed值（与exercise页面显示的值一致）
        avgSpeed = parseFloat(exerciseData.speed).toFixed(1);
      } else if (exerciseData.speedKmh && exerciseData.speedKmh > 0) {
        // 如果没有speed，使用speedKmh
        avgSpeed = parseFloat(exerciseData.speedKmh).toFixed(1);
      } else if (durationInHours > 0) {
        // 最后才使用计算的平均速度作为后备
        avgSpeed = (parseFloat(distance) / durationInHours).toFixed(1);
      }
      
      const watt = exerciseData.watt ? exerciseData.watt: '00';
      const date = exerciseData.dateCongrats || exerciseData.dateFormatted || '2025/09/12';
      
      this.setData({
        userName: userName,
        date: date,
        caloriesBurned: caloriesBurned,
        duration: durationFormatted,
        rpm: rpm,
        avgSpeed: avgSpeed,
        watt: watt,
        distance: distance
      });
    }
  },
  goBack() {
    ty.navigateBack();
  }
});

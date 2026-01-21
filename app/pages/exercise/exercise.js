// 导入 I18n（如果全局 I18n 未定义，则从工具类导入）
const I18nUtil = require('../../utils/i18n.js');
// 使用全局 I18n 或工具类实例
const I18n = global.I18n || I18nUtil;

function formatDpState(dpState) {
    return Object.keys(dpState).map(dpCode => ({ code: dpCode, value: dpState[dpCode] }));
}

// 导入云端同步工具
const { formatHistoryForDp112, saveHistoryToCloud } = require('../../utils/cloudSync.js');

Page({
  data: {
    isPaused: false,
    elapsedTime: 0, 
    rpm: 60,
    heartRate: 0,
    distance: 0,
    formattedTime: '00:00:00',
    calories: 0,
    watt: 0,
    speed: 0,
    load: 1,
    gaugeProgressStyle: '',
    knobAngle: 220, // Start angle
    // 目标模式相关
    isGoalMode: false,
    goalType: null, // 'time', 'distance', 'calories'
    goalValue: 0,
    // 页面标题（初始化为空，在 onLoad 中根据系统语言设置）
    pageTitle: '',
    // 倒计时相关
    countdownTime: 0, // 倒计时剩余时间（秒）
    // 初始值记录（用于计算从0开始的距离和卡路里）
    initialDistance: 0,
    initialCalories: 0,
    goalCompleted: false, // 目标是否已完成
    // 国际化文本（初始化为空，在 onLoad 中根据系统语言设置）
    speedKmhLabel: '',
    caloriesKcalLabel: '',
    workoutTimeLabel: '',
    rpmLabel: '',
    hrBpmLabel: '',
    powerWLabel: '',
    distanceKmLabel: '',
    loadLabel: '',
    inclineLabel: '',
    startHoldStopLabel: ''
  },
  timer: null,
  tempLoad: null, // 临时存储滑动过程中的load值
  throttleTimer: null, // 节流定时器
  throttledUpdateVisual: null, // 节流后的视觉更新函数
  maxResistance: null, // 最大阻力值
  minResistance: null, // 最小阻力值
  resistanceSum: 0, // 阻力总和
  resistanceCount: 0 ,// 阻力计数
  isStopping: false, // 防止重复处理停止逻辑
  dpMaxResistance: null, // 设备上报的最大阻力
  

  /**
   * 获取 I18n 实例的辅助方法
   * 优先使用全局 I18n，如果未定义则使用工具类实例
   */
  getI18n() {
    return global.I18n || I18nUtil;
  },
  
  onLoad(options) {
    // 确保 I18n 已初始化（如果全局未定义，使用工具类实例）
    const currentI18n = this.getI18n();
    
    // 初始化所有翻译文本到 data 中
    this.setData({
      speedKmhLabel: currentI18n.t('speed_kmh'),
      caloriesKcalLabel: currentI18n.t('calories_kcal'),
      workoutTimeLabel: currentI18n.t('workout_time'),
      rpmLabel: currentI18n.t('rpm'),
      hrBpmLabel: currentI18n.t('hr_bpm'),
      powerWLabel: currentI18n.t('power_w'),
      distanceKmLabel: currentI18n.t('distance_km'),
      loadLabel: currentI18n.t('load'),
      inclineLabel: currentI18n.t('incline'),
      startHoldStopLabel: currentI18n.t('start_hold_stop')
    });
    
    // 如果页面标题未设置，根据系统语言设置默认标题
    if (!this.data.pageTitle) {
      this.setData({
        pageTitle: currentI18n.t('quick_start')
      });
    }
    
    ty.hideMenuButton({ success: () => {
      console.log('hideMenuButton success');
    }, fail: (error) => {
      console.log('hideMenuButton fail', error);
    } });
    console.log('Exercise Page Load', options);
    
    // 检查是否是目标模式
    const goalType = options.goalType;
    const goalValue = parseFloat(options.goalValue);
    
    if (goalType && goalValue) {
      this.setData({
        isGoalMode: true,
        goalType: goalType,
        goalValue: goalValue,
        pageTitle: currentI18n.t('target_pattern')
      });
      
      // 如果是时间目标，初始化倒计时
      if (goalType === 'time') {
        const countdownSeconds = goalValue * 60; // 转换为秒
        this.setData({
          countdownTime: countdownSeconds,
          formattedTime: this.formatTime(countdownSeconds)
        });
      }
    }
    
    // 初始化停止标志
    this.isRunning = false,   // 是否正在运动
    this.isPausing = false,   // 是否处于暂停
    this.isStopping = false   // 是否正在结束
    
    // 初始化目标模式的初始值记录（用于从0开始计算）
    if (this.data.isGoalMode) {
      this.initialDistance = null; // 使用null表示尚未记录初始值
      this.initialCalories = null; // 使用null表示尚未记录初始值
    }
    
    this.startTimer();
    this.updateGauge(this.data.load);
    
    // 初始化阻力跟踪
    this.maxResistance = this.data.load;
    this.minResistance = this.data.load;
    this.resistanceSum = this.data.load;
    this.resistanceCount = 1;
    
    // 确保初始阻力值不为0，以便硬件开始上报RPM和Watt
    if (this.data.load === 0) {
      this.setData({ load: 1 });
      this.updateGauge(1);
    }
    
    // 初始化节流函数
    this.throttledUpdateVisual = this.throttle((value) => {
      this.updateGaugeVisual(value);
    }, 100);

    this.debouncedUpdateLoadNumber = this.debounce((finalLoad) => {
      // 这里的逻辑：松手后更新load对应的数字（如果有单独的数字展示，可在此处修改）
      // 若load本身就是要显示的数字，此函数内可无需额外逻辑（因为handleTouchEnd已更新load）
      // 若有其他数字需要同步更新，在此处添加 setData 即可，例如：
      // this.setData({ loadNumber: finalLoad });
    }, 200);
    // 原生调用方式
const { onDpDataChange, registerDeviceListListener } = ty.device;
const { getLaunchOptionsSync } = ty;
// 启动参数中获取设备 id
const {
  query: { deviceId }
} = getLaunchOptionsSync();
 
const _onDpDataChange = (event) => {
  // console.log(formatDpState(event.dps));
console.log('dp点数组:'+ JSON.stringify(formatDpState(event.dps)));
const dpID = formatDpState(event.dps);  //dpID 数组
dpID.forEach(element => {
  if (element.code === 106) { // 只判断code=106，再处理不同的value
    const sportState = element.value?.toUpperCase(); // 统一转大写，兼容大小写
    console.log('硬件上报运动状态:', sportState);
  
    // 避免重复处理（结合isStopping/isStarting等状态）
    switch (sportState) {
      case 'START': // 硬件上报“开始”
        if (!this.isRunning) {
          this.handleStartExercise(false); // false：硬件主动开始，软件不回发指令
        }
        break;
      
      case 'PAUSE': // 硬件上报“暂停（继续的前置状态）”
        if (this.isRunning && !this.isPausing) {
          this.handlePauseExercise(false); // 处理暂停逻辑
        }
        break;
      
        case 'END': // 硬件上报“结束”（对应之前的STOP）
        if (!this.isStopping) {
          this.handleStopExercise(false); // 处理结束逻辑
        }
        break;
    }
    return;
  }
  //speed
  if(element.code == 105) {
    this.setData({
      speed: (element.value/1000).toFixed(1)
    });
  }
  //rpm
  if(element.code == 110) {
    this.setData({
      rpm: element.value
    });
  }
  // 时间
  if(element.code == 104) {
    if (this.data.isGoalMode && this.data.goalType === 'time') {
      // 目标模式下的时间目标：使用倒计时，不直接使用硬件上报的时间
      // 但可以用于记录实际运动时间
      // 这里不做处理，由定时器控制倒计时
    } else {
      // 非目标模式或非时间目标：正常使用硬件上报的时间
      this.setData({
        elapsedTime: element.value,
        formattedTime: this.formatTime(element.value)
      });
    }
  }
  //心率
  if(element.code == 108) {
    this.setData({
      heartRate: element.value
    });
  }
  // 距离
  if (element.code == 103) {
    const rawDistance = element.value / 1000;
    if (this.data.isGoalMode) {
      // 目标模式：从0开始
      if (this.initialDistance === null) {
        this.initialDistance = rawDistance;
      }
      const currentDistance = Math.max(0, rawDistance - this.initialDistance);
      this.setData({
        distance: currentDistance.toFixed(2)
      });
      // 检查目标完成
      if (this.data.goalType === 'distance' && currentDistance >= this.data.goalValue) {
        this.checkGoalCompleted();
      }
    } else {
      this.setData({
        distance: rawDistance.toFixed(2)
      });
    }
  }
 // 卡路里
 if(element.code == 107) {
  console.log('卡路里:', element.value);
  const rawCalories = element.value / 1000;
  if (this.data.isGoalMode) {
    // 目标模式：从0开始
    if (this.initialCalories === null) {
      this.initialCalories = rawCalories;
    }
    const currentCalories = Math.max(0, rawCalories - this.initialCalories);
    this.setData({
      calories: currentCalories.toFixed(1)
    });
    // 检查目标完成
    if (this.data.goalType === 'calories' && currentCalories >= this.data.goalValue) {
      this.checkGoalCompleted();
    }
  } else {
    this.setData({
      calories: rawCalories.toFixed(1)
    });
  }
}
  //功率
  if(element.code == 109) {
    console.log('功率:', element.value);
    this.setData({
      watt: element.value
    });
  }
  // 最大阻力
  if(element.code == 111) {
    console.log('设备上报最大阻力:', element.value);
    this.setData({
      dpMaxResistance: element.value
    });
  }

  //阻力
if(element.code == 102) {
  console.log('阻力:', element.value);
  const loadValue = element.value;
  this.setData({
    load: loadValue
  });
}
});
}

registerDeviceListListener({
  deviceIdList: [deviceId],
  success: () => {
    console.log('registerDeviceListListener success');
  },
  fail: (error) => {
    console.log('registerDeviceListListener fail', error);
  }
  });
onDpDataChange(_onDpDataChange);
  },

  onUnload() {
    this.stopTimer();
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

  formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    const h = hours.toString().padStart(2, '0');
    const m = minutes.toString().padStart(2, '0');
    const s = secs.toString().padStart(2, '0');
    
    // 强制返回 HH:MM:SS 格式，不随小时是否为0变化
    return `${h}:${m}:${s}`; 
  },

  startTimer() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      if (!this.data.isPaused && !this.data.goalCompleted) {
        // 仅在「时间目标模式」下，使用本地定时器更新倒计时
        if (this.data.isGoalMode && this.data.goalType === 'time') {
          const newCountdown = this.data.countdownTime - 1;
          if (newCountdown <= 0) {
            this.setData({
              countdownTime: 0,
              formattedTime: this.formatTime(0),
              elapsedTime: this.data.goalValue * 60
            });
            this.checkGoalCompleted();
          } else {
            this.setData({
              countdownTime: newCountdown,
              formattedTime: this.formatTime(newCountdown),
              elapsedTime: this.data.goalValue * 60 - newCountdown
            });
          }
        }
        // 非时间目标模式下，不执行本地时间更新，避免与硬件上报冲突
      }
    }, 1000);
  },

  stopTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  },

  // 处理开始运动
  handleStartExercise(sendCommand) {
    if (this.isRunning) {
      console.log('运动已在进行中，跳过重复开始');
      return;
    }
    
    this.isRunning = true;
    this.isPausing = false;
    
    // 确保阻力值已设置（至少为1），这样硬件才能开始上报RPM和Watt
    const currentLoad = this.data.load || 1;
    const { query: { deviceId } } = ty.getLaunchOptionsSync();
    
    // 先设置阻力，确保硬件开始上报数据
    if (deviceId) {
      ty.device.publishDps({
        deviceId,
        dps: { 102: currentLoad },
        mode: 1,
        pipelines: [0, 1, 2, 3, 4, 5, 6],
        success: () => {
          console.log('阻力已设置:', currentLoad);
          this.updateGauge(currentLoad);
          
          // 阻力设置成功后再发送开始命令
          if (sendCommand) {
            ty.device.publishDps({
              deviceId,
              dps: { 106: 'START' },
              mode: 1,
              pipelines: [0, 1, 2, 3, 4, 5, 6],
              success: () => {
                console.log('开始运动命令已发送');
                this.setData({ isPaused: false });
              },
              fail: (err) => {
                console.error('开始运动命令发送失败:', err);
              }
            });
          } else {
            this.setData({ isPaused: false });
          }
        },
        fail: (err) => {
          console.error('设置阻力失败:', err);
          // 即使设置阻力失败，也继续发送开始命令
          if (sendCommand) {
            ty.device.publishDps({
              deviceId,
              dps: { 106: 'START' },
              mode: 1,
              pipelines: [0, 1, 2, 3, 4, 5, 6],
              success: () => {
                console.log('开始运动命令已发送');
                this.setData({ isPaused: false });
              },
              fail: (err) => {
                console.error('开始运动命令发送失败:', err);
              }
            });
          } else {
            this.setData({ isPaused: false });
          }
        }
      });
    } else {
      // 如果没有deviceId，直接更新状态
      if (sendCommand) {
        console.warn('deviceId不存在，无法发送命令');
      }
      this.setData({ isPaused: false });
    }
  },

  // 处理暂停运动
  handlePauseExercise(sendCommand) {
    if (!this.isRunning) {
      console.log('运动未开始，无法暂停');
      return;
    }
    
    this.isPausing = true;
    
    if (sendCommand) {
      const { query: { deviceId } } = ty.getLaunchOptionsSync();
      if (deviceId) {
        ty.device.publishDps({
          deviceId,
          dps: { 106: 'PAUSE' },
          mode: 1,
          pipelines: [0, 1, 2, 3, 4, 5, 6],
          success: () => {
            console.log('暂停命令已发送');
            this.setData({ isPaused: true });
          },
          fail: (err) => {
            console.error('暂停命令发送失败:', err);
          }
        });
      }
    } else {
      this.setData({ isPaused: true });
    }
  },

  togglePause() {
    const { query: { deviceId } } = ty.getLaunchOptionsSync();
    const targetState = !this.data.isPaused;
    // 替换为硬件实际的暂停/继续指令（如硬件用 0 表示暂停，1 表示继续）
    const controlCmd = targetState ? 'PAUSE' : 'START'; 
  
    if (!targetState) {
      // 如果继续运动，先确保阻力已设置，然后再发送开始命令
      const currentLoad = this.data.load || 1;
      this.isRunning = true;
      this.isPausing = false;
      
      // 先设置阻力，确保硬件开始上报RPM和Watt
      ty.device.publishDps({
        deviceId,
        dps: { 102: currentLoad },
        mode: 1,
        pipelines: [0, 1, 2, 3, 4, 5, 6],
        success: () => {
          console.log('继续运动时设置阻力:', currentLoad);
          this.updateGauge(currentLoad);
          
          // 阻力设置成功后再发送开始命令
          ty.device.publishDps({
            deviceId,
            dps: { 106: 'START' },
            mode: 1,
            pipelines: [0, 1, 2, 3, 4, 5, 6],
            success: () => {
              this.setData({ isPaused: false });
              ty.showToast({ title: this.getI18n().t('resumed'), icon: 'none' });
            },
            fail: (err) => {
              console.error('继续运动命令发送失败:', err);
              ty.showToast({ title: this.getI18n().t('operation_failed'), icon: 'none' });
            }
          });
        },
        fail: (err) => {
          console.error('设置阻力失败:', err);
          // 即使设置阻力失败，也继续发送开始命令
          ty.device.publishDps({
            deviceId,
            dps: { 106: 'START' },
            mode: 1,
            pipelines: [0, 1, 2, 3, 4, 5, 6],
            success: () => {
              this.setData({ isPaused: false });
              ty.showToast({ title: this.getI18n().t('resumed'), icon: 'none' });
            },
            fail: (err) => {
              console.error('继续运动命令发送失败:', err);
              ty.showToast({ title: this.getI18n().t('operation_failed'), icon: 'none' });
            }
          });
        }
      });
    } else {
      // 暂停运动
      ty.device.publishDps({
        deviceId,
        dps: { 106: 'PAUSE' },
        mode: 1,
        pipelines: [0, 1, 2, 3, 4, 5, 6],
        success: () => {
          this.setData({ isPaused: true });
          this.isPausing = true;
          ty.showToast({ title: this.getI18n().t('paused'), icon: 'none' });
        },
        fail: (err) => {
          console.error('暂停命令发送失败:', err);
          ty.showToast({ title: this.getI18n().t('operation_failed'), icon: 'none' });
        }
      });
    }
  },

  // 检查目标是否完成
  checkGoalCompleted() {
    if (this.data.goalCompleted) return; // 防止重复触发
    
    let completed = false;
    const { goalType, goalValue } = this.data;
    
    if (goalType === 'time') {
      // 时间目标：倒计时到0
      completed = this.data.countdownTime <= 0;
    } else if (goalType === 'distance') {
      // 距离目标：当前距离 >= 目标距离
      completed = parseFloat(this.data.distance) >= goalValue;
    } else if (goalType === 'calories') {
      // 卡路里目标：当前卡路里 >= 目标卡路里
      completed = parseFloat(this.data.calories) >= goalValue;
    }
    
    if (completed) {
      this.setData({ goalCompleted: true });
      // 暂停计时器
      this.setData({ isPaused: true });
      
      // 显示完成提示框
      ty.showModal({
        title: this.getI18n().t('goal_completed'),
        content: this.getI18n().t('goal_completed_message'),
        confirmText: this.getI18n().t('confirm'),
        cancelText: this.getI18n().t('cancel'),
        success: (res) => {
          if (res.confirm) {
            // 先上报数据到云端，再处理停止逻辑
            const { query: { deviceId } } = ty.getLaunchOptionsSync();
            if (deviceId) {
              console.log('目标完成，开始上报数据到云端');
              this.reportExerciseDataToCloud(deviceId);
            } else {
              console.warn('目标完成，但设备ID为空，无法上报数据');
            }
            // 跳转到congrats页面
            this.handleStopExercise(true);
          } else {
            // 取消：继续运动
            this.setData({ 
              goalCompleted: false,
              isPaused: false 
            });
          }
        }
      });
    }
  },

  stopExercise() {
    ty.showModal({
      title: this.getI18n().t('end_workout'),
      content: this.getI18n().t('end_workout_confirm'),
      confirmText: this.getI18n().t('confirm'),
      cancelText: this.getI18n().t('cancel'),
      success: (res) => {
        if (res.confirm) {
          // 向硬件发送停止命令
          const { query: { deviceId } } = ty.getLaunchOptionsSync();
          if (deviceId) {
            ty.device.publishDps({
              deviceId,
              dps: { 106: 'END' },
              mode: 1,
              pipelines: [0, 1, 2, 3, 4, 5, 6],
              success: () => {
                console.log('停止命令已发送到硬件');
                // 停止命令发送成功后，上报运动数据到云端
                this.reportExerciseDataToCloud(deviceId);
                this.handleStopExercise(true); // true表示已发送命令
              },
              fail: (err) => {
                console.error('硬件停止指令发送失败:', err);
                // 即使发送失败，也继续执行停止逻辑，并尝试上报数据
                this.reportExerciseDataToCloud(deviceId);
                this.handleStopExercise(true);
              }
            });
          } else {
            // 如果没有deviceId，直接执行停止逻辑
            this.handleStopExercise(true);
          }
        }
      }
    });
  },

  // 上报运动数据到云端（通过 DP 点 112）
  reportExerciseDataToCloud(deviceId) {
    if (!deviceId) {
      console.warn('设备ID为空，无法上报数据到云端');
      return;
    }

    try {
      // 收集所有运动数据
      const now = new Date();
      const timestamp = now.getTime();
      const elapsedSeconds = this.data.elapsedTime;
      
      // 计算平均阻力
      const avgResistance = this.resistanceCount > 0 
        ? (this.resistanceSum / this.resistanceCount).toFixed(1) 
        : this.data.load;
      
      // 格式化时间
      const durationFormatted = this.formatTime(elapsedSeconds);
      
      // 构建运动记录对象
      const finalMaxResistance = this.dpMaxResistance ?? this.maxResistance ?? 0;
      // 确保 isGoalMode 和 pageTitle 正确传递
      const isGoalMode = this.data.isGoalMode === true;
      const pageTitle = this.data.pageTitle || (isGoalMode ? this.getI18n().t('target_pattern') : this.getI18n().t('quick_start'));
      
      const exerciseRecord = {
        id: timestamp,
        duration: elapsedSeconds,
        durationFormatted: durationFormatted,
        date: now.toISOString(),
        speed: parseFloat(this.data.speed) || 0,
        rpm: parseFloat(this.data.rpm) || 0,
        calories: parseFloat(this.data.calories) || 0,
        distance: parseFloat(this.data.distance) || 0,
        watt: this.data.watt || 0,
        heartRate: this.data.heartRate || 0,
        load: this.data.load || 0,
        maxResistance: finalMaxResistance,
        minResistance: this.minResistance || 0,
        avgResistance: parseFloat(avgResistance) || 0,

        isGoalMode: isGoalMode,
        pageTitle: pageTitle,
      };
      
      console.log('构建运动记录 - isGoalMode:', isGoalMode, 'pageTitle:', pageTitle);
      console.log('=== 上报运动数据到云端 ===');
      console.log('设备ID:', deviceId);
      console.log('运动记录ID:', exerciseRecord.id);
      console.log('原始记录数据:', JSON.stringify(exerciseRecord, null, 2));

      // 使用 cloudSync.js 的 saveHistoryToCloud 方法上传到云端
      saveHistoryToCloud(deviceId, exerciseRecord)
        .then((res) => {
          console.log('✓ 运动数据已成功上传到云端');
          console.log('响应数据:', JSON.stringify(res, null, 2));
        })
        .catch((error) => {
          console.error('✗ 运动数据上传到云端失败:');
          console.error('错误详情:', JSON.stringify(error, null, 2));
          console.error('错误消息:', error.errorMsg || error.message || error);
          console.error('错误代码:', error.errorCode || error.code);
        });

    } catch (error) {
      console.error('上报运动数据到云端失败:', error);
    }
  },

  // 处理停止运动的通用方法
  // sendCommand: true表示已经发送了命令（或不需要发送），false表示不需要发送命令（硬件触发的）
  handleStopExercise(sendCommand) {
    // 防止重复处理
    if (this.isStopping) {
      console.log('停止逻辑已在处理中，跳过重复调用');
      return;
    }
    this.isStopping = true;

    // 停止计时器
    this.stopTimer();
    
    // 收集所有运动数据
    const now = new Date();
    const timestamp = now.getTime();
    const elapsedSeconds = this.data.elapsedTime;
    
    // 计算平均阻力
    const avgResistance = this.resistanceCount > 0 
      ? (this.resistanceSum / this.resistanceCount).toFixed(1) 
      : this.data.load;
    
    // 单位转换：速度从 mi/h 转为 km/h
    const speedKmh = (parseFloat(this.data.speed) * 1.609).toFixed(1);
 
    
    // 格式化时间
    const durationFormatted = this.formatTime(elapsedSeconds);
    
    // 格式化日期 - congrats格式: "2025/09/12"
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const dateCongrats = `${year}/${month}/${day}`;
    
    // 格式化日期 - history格式: "12月11日 12:01:03"
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    // 使用中文字符，确保UTF-8编码正确
    const dateFormatted = `${month}月${day}日 ${hours}:${minutes}:${seconds}`;
    
    // 构建运动记录对象
    const finalMaxResistance = this.dpMaxResistance ?? this.maxResistance ?? 0;
    // 确保 isGoalMode 和 pageTitle 正确传递
    const isGoalMode = this.data.isGoalMode === true;
    const currentI18n = this.getI18n();
    const pageTitle = this.data.pageTitle || (isGoalMode ? currentI18n.t('target_pattern') : currentI18n.t('quick_start'));
    
    const exerciseRecord = {
      id: timestamp,
      duration: elapsedSeconds,
      durationFormatted: durationFormatted,
      date: new Date().toISOString(),
      dateFormatted: dateFormatted,
      dateCongrats: dateCongrats,
      speed: parseFloat(this.data.speed) || 0,
      rpm: parseFloat(this.data.rpm) || 0,
      calories: parseFloat(this.data.calories) || 0,
      distance: parseFloat(this.data.distance) || 0,
      watt: this.data.watt || 0,
      heartRate: this.data.heartRate || 0,
      load: this.data.load || 0,
      maxResistance: finalMaxResistance,
      minResistance: this.minResistance || 0,
      avgResistance: parseFloat(avgResistance) || 0,
      // 添加模式信息
      isGoalMode: isGoalMode,
      pageTitle: pageTitle
    };
    
    // 验证数据完整性
    let saveSuccess = true;
    if (!exerciseRecord.id || exerciseRecord.duration < 0) {
      console.error('Invalid exercise record data');
      ty.showToast({
        title: this.getI18n().t('data_save_failed_incomplete'),
        icon: 'none'
      });
      saveSuccess = false;
    } else {
      // 保存到storage
      try {
        // 统一使用字符串key的方式获取存储数据
        const history = ty.getStorageSync('exerciseHistory') || [];
        
        // 确保history是数组
        if (!Array.isArray(history)) {
          console.warn('exerciseHistory is not an array, resetting to empty array');
          ty.setStorageSync('exerciseHistory', []);
        }
        
        // 添加到数组开头（最新的在前）
        const updatedHistory = [exerciseRecord, ...history];
        
        // 保存到storage，使用setStorage确保UTF-8编码正确处理
        ty.setStorage({
          key: 'exerciseHistory',
          data: updatedHistory,
          success: (res) => {
            console.log('本地存储成功');
            // 验证存储的数据，确保中文正确
            console.log('存储的日期格式:', exerciseRecord.dateFormatted);
          },
          fail: (err) => {
            console.error('本地存储失败:', err);
          }
        });
        console.log('Exercise record saved successfully:', exerciseRecord.id);
        console.log('Date formatted:', exerciseRecord.dateFormatted);
      } catch (error) {
        console.error('Error saving exercise record to storage:', error);
        ty.showToast({
          title: this.getI18n().t('data_save_failed'),
          icon: 'none'
        });
        saveSuccess = false;
      }
    }
    
    // 即使保存失败，也继续跳转到congrats页面（数据已通过URL参数传递）
    
    // 跳转到congrats页面，通过URL参数传递数据
    const params = new URLSearchParams({
      id: timestamp.toString(),
      duration: elapsedSeconds.toString(),
      speed: parseFloat(this.data.speed) || 0,
      speedKmh: speedKmh,
      calories: this.data.calories,
      distance: this.data.distance,
      rpm: this.data.rpm.toString(),
      watt: this.data.watt.toString(),
      heartRate: this.data.heartRate.toString(),
      maxResistance: this.maxResistance.toString(),
      minResistance: this.minResistance.toString(),
      avgResistance: avgResistance,
      dateCongrats: dateCongrats
    });
    
    ty.navigateTo({
      url: `/pages/congrats/congrats?${params.toString()}`
    });
  },

  onReady() {
    const query = ty.createSelectorQuery();
    query.select('.gauge-wrapper').boundingClientRect((rect) => {
      if (rect) {
        this.gaugeRect = rect;
        this.gaugeCenter = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2
        };
      }
    }).exec();
  },

// 节流函数，改为真正的固定间隔节流
throttle(func, delay) {
  let lastExecTime = 0; // 记录上一次执行时间
  return (...args) => {
    const now = Date.now();
    // 只有当前时间与上一次执行时间的间隔 >= delay，才执行函数
    if (now - lastExecTime >= delay) {
      func.apply(this, args);
      lastExecTime = now;
    }
  };
},

  debounce(func, delay) {
    let debounceTimer = null;
    return (...args) => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        func.apply(this, args);
      }, delay);
    };
  },

  // 仅更新视觉位置（不更新load数据和发送命令）
  updateGaugeVisual(value) {
    const maxLoad = 15; // 改为坡度范围 0-15
    const currentValue = Math.min(Math.max(value, 0), maxLoad);
    const maxAngle = 270;
    const progressAngle = (currentValue / maxLoad) * maxAngle;
    const startAngle = 220;
    const knobAngle = startAngle + progressAngle;

    this.setData({
      gaugeProgressStyle: `
        background: conic-gradient(from ${startAngle}deg, #ADFF2F 0deg, #ADFF2F ${progressAngle}deg, transparent ${progressAngle}deg);
      `,
      knobAngle: knobAngle
    });
  },
  handleTouchMove(e) {
    if (!this.gaugeCenter) return;
  
    const touch = e.touches[0];
    const dx = touch.clientX - this.gaugeCenter.x;
    const dy = touch.clientY - this.gaugeCenter.y;
  
    let angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
    if (angle < 0) angle += 360;
  
    let adjustedAngle = angle;
    if (angle >= 0 && angle <= 220) {
      adjustedAngle = angle + 360;
    }
  
    const startAngle = 220;
    const maxSweep = 270;
    const endAngle = startAngle + maxSweep;
    if (adjustedAngle < startAngle) adjustedAngle = startAngle;
    if (adjustedAngle > endAngle) adjustedAngle = endAngle;
  
    const progress = (adjustedAngle - startAngle) / maxSweep;
    const maxLoad = 15; // 改为坡度范围 0-15
    const newLoad = Math.min(Math.floor(progress * maxLoad), maxLoad);
  
    this.tempLoad = newLoad;
  
    // 仅执行视觉更新，不触发其他逻辑，避免冲突
    if (this.throttledUpdateVisual) {
      this.throttledUpdateVisual(newLoad);
    }
  },

  handleTouchEnd(e) {
    if (this.throttleTimer) {
      clearTimeout(this.throttleTimer);
      this.throttleTimer = null;
    }
    
    if (this.tempLoad !== null && this.tempLoad !== this.data.load) {
      const finalLoad = this.tempLoad;
      // 添加 50ms 延迟，平滑过渡视觉更新
      setTimeout(() => {
        this.updateGauge(finalLoad);
        this.debouncedUpdateLoadNumber(finalLoad);
      }, 50);
      
      // 设备命令发送逻辑不变
      const { query: { deviceId } } = ty.getLaunchOptionsSync();
      if (deviceId) {
        ty.device.publishDps({
          deviceId,
          dps: { 102: finalLoad },
          mode: 1,
          pipelines: [0, 1, 2, 3, 4, 5, 6],
          success: () => {
            console.log('Load updated to:', finalLoad);
            if (this.isRunning && !this.data.isPaused) {
              console.log('运动进行中，阻力已更新');
            } else if (!this.isRunning && !this.data.isPaused) {
              console.log('运动未开始，阻力设置后自动开始运动');
              this.handleStartExercise(true);
            }
          },
          fail: (err) => {
            console.error('Failed to update load:', err);
          }
        });
      }
    }
    
    this.tempLoad = null;
  },

  // 处理速度增加
  handleIncreaseSpeed() {
    const currentSpeed = parseFloat(this.data.speed) || 0;
    const newSpeed = Math.min(currentSpeed + 0.1, 99.9); // 限制最大速度为 99.9
    this.setData({
      speed: newSpeed.toFixed(1)
    });
    // 如果需要同步到硬件，可以在这里添加设备命令
    const { query: { deviceId } } = ty.getLaunchOptionsSync();
    if (deviceId) {
      // 假设速度通过某个 DP 点控制，需要根据实际硬件协议调整
      // ty.device.publishDps({
      //   deviceId,
      //   dps: { 105: Math.round(newSpeed * 1000) }, // 根据实际协议调整
      //   mode: 1,
      //   pipelines: [0, 1, 2, 3, 4, 5, 6]
      // });
    }
  },

  // 处理速度减少
  handleDecreaseSpeed() {
    const currentSpeed = parseFloat(this.data.speed) || 0;
    const newSpeed = Math.max(currentSpeed - 0.1, 0); // 限制最小速度为 0
    this.setData({
      speed: newSpeed.toFixed(1)
    });
    // 如果需要同步到硬件，可以在这里添加设备命令
    const { query: { deviceId } } = ty.getLaunchOptionsSync();
    if (deviceId) {
      // 假设速度通过某个 DP 点控制，需要根据实际硬件协议调整
      // ty.device.publishDps({
      //   deviceId,
      //   dps: { 105: Math.round(newSpeed * 1000) }, // 根据实际协议调整
      //   mode: 1,
      //   pipelines: [0, 1, 2, 3, 4, 5, 6]
      // });
    }
  },

  updateGauge(value) {
    const maxLoad = 15; // 改为坡度范围 0-15
    const currentValue = Math.min(Math.max(value, 0), maxLoad); // Ensure bounds
    const maxAngle = 270;
    const progressAngle = (currentValue / maxLoad) * maxAngle;
    const startAngle = 220;
    const knobAngle = startAngle + progressAngle;

    // 更新阻力跟踪
    if (this.maxResistance === null || currentValue > this.maxResistance) {
      this.maxResistance = currentValue;
    }
    if (this.minResistance === null || currentValue < this.minResistance) {
      this.minResistance = currentValue;
    }
    this.resistanceSum += currentValue;
    this.resistanceCount += 1;

    this.setData({
      load: currentValue,
      gaugeProgressStyle: `
        background: conic-gradient(from ${startAngle}deg, #ADFF2F 0deg, #ADFF2F ${progressAngle}deg, transparent ${progressAngle}deg);
      `,
      knobAngle: knobAngle
    });
  }
})

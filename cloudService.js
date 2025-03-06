// 等待 AV 对象加载完成
function waitForAV() {
    return new Promise((resolve) => {
        if (window.AV) {
            resolve(window.AV);
        } else {
            // 每100ms检查一次AV是否加载完成
            const checkInterval = setInterval(() => {
                if (window.AV) {
                    clearInterval(checkInterval);
                    resolve(window.AV);
                }
            }, 100);
        }
    });
}

class CloudService {
    static async initialize() {
        try {
            const AV = await waitForAV();
            AV.init({
                appId: 'cORtswrLPYVaAtnmccnrUxlH-gzGzoHsz',
                appKey: '31TPHee1i9Mha2mV4KYVub6C',
                serverURL: 'https://cortswrl.lc-cn-n1-shared.com',
                requestTimeout: 30000,
                serverURLs: {
                    api: 'https://cortswrl.lc-cn-n1-shared.com',
                    engine: 'https://cortswrl.lc-cn-n1-shared.com',
                    stats: 'https://cortswrl.lc-cn-n1-shared.com'
                }
            });
            console.log('LeanCloud 初始化成功');
            return CloudService;
        } catch (error) {
            console.error('LeanCloud 初始化失败:', error);
            throw error;
        }
    }

    // 用户相关操作
    static async register(username, password) {
        try {
            // 检查用户名格式
            if (username.length < 3 || username.length > 20) {
                return { success: false, error: '用户名长度需要在3-20个字符之间' };
            }
            
            // 检查密码格式
            if (password.length < 6 || password.length > 20) {
                return { success: false, error: '密码长度需要在6-20个字符之间' };
            }

            const user = new window.AV.User();
            user.setUsername(username);
            user.setPassword(password);
            await user.signUp();
            console.log('注册成功:', username);
            return { success: true, user: user.toJSON() };
        } catch (error) {
            console.error('注册失败:', error);
            if (error.code === 202) {
                return { success: false, error: '该用户名已被使用' };
            } else if (error.code === 214) {
                return { success: false, error: '用户名或密码格式不正确' };
            } else if (error.code === 403) {
                return { success: false, error: '服务器拒绝访问，请确认域名是否已在 LeanCloud 后台设置' };
            } else {
                return { success: false, error: `注册失败：${error.message || '未知错误'}` };
            }
        }
    }

    static async login(username, password) {
        try {
            const user = await window.AV.User.logIn(username, password);
            return { success: true, user: user.toJSON() };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    static logout() {
        window.AV.User.logOut();
    }

    static getCurrentUser() {
        try {
            const user = window.AV.User.current();
            if (user) {
                // 检查用户会话是否有效
                const sessionToken = user._sessionToken;
                console.log('当前登录用户:', user.getUsername(), '会话令牌:', sessionToken ? '有效' : '无效');
                
                if (!sessionToken) {
                    console.warn('用户会话令牌无效，可能需要重新登录');
                    // 可以考虑在此处清除无效的用户缓存，但考虑到用户体验，暂时不执行此操作
                    // window.AV.User.logOut();
                    // return null;
                }
                
                return user;
            } else {
                console.log('当前没有登录用户');
                return null;
            }
        } catch (error) {
            console.error('获取当前用户时出错:', error);
            return null;
        }
    }

    // 数据同步操作
    static async saveBabyData(babyData) {
        try {
            // 检查用户是否已登录
            const currentUser = window.AV.User.current();
            if (!currentUser) {
                console.error('保存失败: 用户未登录');
                return { success: false, error: '请先登录' };
            }

            // 检查必要的数据字段
            if (!babyData || !babyData.name || !babyData.birthday) {
                console.error('保存失败: 数据格式不正确', babyData);
                return { success: false, error: '请填写完整的宝宝信息' };
            }

            console.log('开始保存宝宝数据:', babyData);

            const Baby = window.AV.Object.extend('Baby');
            const query = new window.AV.Query(Baby);
            query.equalTo('cloudId', babyData.id);
            query.equalTo('user', currentUser);
            const existingBaby = await query.first();

            let baby;
            if (existingBaby) {
                console.log('更新已存在的宝宝数据');
                baby = existingBaby;
            } else {
                console.log('创建新的宝宝数据');
                baby = new Baby();
                baby.set('cloudId', babyData.id);
                baby.set('user', currentUser);
            }

            baby.set('name', babyData.name);
            baby.set('birthday', babyData.birthday);
            
            const savedBaby = await baby.save();
            console.log('宝宝数据保存成功:', savedBaby.toJSON());
            
            return { 
                success: true, 
                baby: {
                    id: savedBaby.get('cloudId'),
                    name: savedBaby.get('name'),
                    birthday: savedBaby.get('birthday')
                }
            };
        } catch (error) {
            console.error('保存宝宝数据失败:', error);
            return { 
                success: false, 
                error: error.message || '保存失败，请重试'
            };
        }
    }

    static async saveRecord(record) {
        try {
            console.log('保存记录:', record);
            const Record = window.AV.Object.extend('Record');
            const newRecord = new Record();
            newRecord.set('type', record.type);
            
            // 保存为本地时区的时间
            newRecord.set('time', new Date(record.time));
            newRecord.set('amount', record.amount);
            newRecord.set('babyId', record.babyId);
            newRecord.set('user', window.AV.User.current());
            if (record.type === 'sleep') {
                // 保存为本地时区的睡眠时间
                newRecord.set('start', new Date(record.start));
                if (record.end) {
                    newRecord.set('end', new Date(record.end));
                    newRecord.set('duration', record.duration);
                }
            }
            await newRecord.save();
            
            // 返回带有ID的记录
            const savedRecord = {
                ...record,
                id: newRecord.id,
                cloudId: newRecord.id
            };
            
            console.log('记录保存成功:', savedRecord);
            return { success: true, record: savedRecord };
        } catch (error) {
            console.error('保存记录失败:', error);
            return { success: false, error: error.message };
        }
    }

    static async getBabies() {
        try {
            const Baby = window.AV.Object.extend('Baby');
            const query = new window.AV.Query(Baby);
            query.equalTo('user', window.AV.User.current());
            const babies = await query.find();
            return { 
                success: true, 
                babies: babies.map(baby => ({
                    id: baby.get('cloudId'),
                    name: baby.get('name'),
                    birthday: baby.get('birthday')
                }))
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    static async getRecords(babyId) {
        try {
            console.log('获取记录, babyId:', babyId);
            const Record = window.AV.Object.extend('Record');
            const query = new window.AV.Query(Record);
            query.equalTo('babyId', babyId);
            query.equalTo('user', window.AV.User.current());
            query.addAscending('time');
            const records = await query.find();
            console.log('获取到的原始记录:', records);
            
            const processedRecords = records.map(record => ({
                id: record.id, // 添加记录ID
                cloudId: record.id, // 保存云端ID的备份
                type: record.get('type'),
                time: record.get('time').toISOString(),
                amount: record.get('amount'),
                start: record.get('start')?.toISOString(),
                end: record.get('end')?.toISOString(),
                duration: record.get('duration'),
                babyId: record.get('babyId'),
                displayTime: record.get('time').toLocaleString(),
                displayStart: record.get('start')?.toLocaleString(),
                displayEnd: record.get('end')?.toLocaleString()
            }));
            
            console.log('处理后的记录:', processedRecords);
            
            return { 
                success: true, 
                records: processedRecords
            };
        } catch (error) {
            console.error('获取记录失败:', error);
            return { success: false, error: error.message };
        }
    }

    static async deleteRecord(recordId) {
        try {
            console.log('CloudService.deleteRecord - 尝试删除记录:', recordId, '类型:', typeof recordId);
            
            if (!recordId) {
                console.error('CloudService.deleteRecord - 记录ID无效:', recordId);
                return { success: false, error: '记录ID无效' };
            }
            
            // 使用LeanCloud的原始方式创建对象引用进行删除
            console.log('CloudService.deleteRecord - 创建记录引用并准备删除');
            const record = window.AV.Object.createWithoutData('Record', recordId);
            await record.destroy();
            console.log('CloudService.deleteRecord - 记录删除成功:', recordId);
            return { success: true };
        } catch (error) {
            console.error('CloudService.deleteRecord - 删除记录失败:', error);
            return { success: false, error: error.message };
        }
    }

    static async deleteBaby(babyId) {
        try {
            const Baby = window.AV.Object.extend('Baby');
            const query = new window.AV.Query(Baby);
            query.equalTo('cloudId', babyId);
            const baby = await query.first();
            if (baby) {
                await baby.destroy();
            }
            
            // 删除相关记录
            const Record = window.AV.Object.extend('Record');
            const recordQuery = new window.AV.Query(Record);
            recordQuery.equalTo('babyId', babyId);
            const records = await recordQuery.find();
            await window.AV.Object.destroyAll(records);
            
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    static async updateSleepRecord(record) {
        try {
            const Record = window.AV.Object.extend('Record');
            const query = new window.AV.Query(Record);
            query.equalTo('type', 'sleep');
            query.equalTo('start', new Date(record.start));
            query.equalTo('babyId', record.babyId);
            query.equalTo('user', window.AV.User.current());
            
            const existingRecord = await query.first();
            if (existingRecord) {
                existingRecord.set('end', new Date(record.end));
                existingRecord.set('duration', record.duration);
                await existingRecord.save();
                return { success: true, record: existingRecord.toJSON() };
            } else {
                return { success: false, error: '未找到睡眠记录' };
            }
        } catch (error) {
            console.error('更新睡眠记录失败:', error);
            return { success: false, error: error.message };
        }
    }

    // 添加通用记录更新功能
    static async updateRecord(record) {
        try {
            console.log('尝试更新记录:', record);
            const existingRecord = window.AV.Object.createWithoutData('Record', record.id);
            
            // 更新通用字段 - 保存为本地时区的时间
            existingRecord.set('time', new Date(record.time));
            
            // 根据记录类型更新特定字段
            if (record.type === 'milk') {
                existingRecord.set('amount', record.amount);
            } else if (record.type === 'sleep') {
                // 保存为本地时区的睡眠时间
                existingRecord.set('start', new Date(record.start));
                existingRecord.set('end', new Date(record.end));
                existingRecord.set('duration', record.duration);
            }
            
            await existingRecord.save();
            console.log('记录更新成功');
            return { 
                success: true, 
                record: {
                    id: existingRecord.id,
                    type: existingRecord.get('type'),
                    time: existingRecord.get('time').toISOString(),
                    amount: existingRecord.get('amount'),
                    start: existingRecord.get('start')?.toISOString(),
                    end: existingRecord.get('end')?.toISOString(),
                    duration: existingRecord.get('duration'),
                    babyId: existingRecord.get('babyId')
                }
            };
        } catch (error) {
            console.error('更新记录失败:', error);
            return { success: false, error: error.message };
        }
    }

    static async setupLiveQuery(onRecordCreate, onRecordUpdate, onRecordDelete) {
        try {
            const Record = window.AV.Object.extend('Record');
            const query = new window.AV.Query(Record);
            query.equalTo('user', window.AV.User.current());
            
            const liveQuery = await query.subscribe();
            
            // 新记录创建时
            liveQuery.on('create', (record) => {
                const recordData = {
                    id: record.id,
                    type: record.get('type'),
                    time: record.get('time').toISOString(),
                    amount: record.get('amount'),
                    start: record.get('start')?.toISOString(),
                    end: record.get('end')?.toISOString(),
                    duration: record.get('duration'),
                    babyId: record.get('babyId')
                };
                onRecordCreate && onRecordCreate(recordData);
            });

            // 记录更新时
            liveQuery.on('update', (record) => {
                const recordData = {
                    id: record.id,
                    type: record.get('type'),
                    time: record.get('time').toISOString(),
                    amount: record.get('amount'),
                    start: record.get('start')?.toISOString(),
                    end: record.get('end')?.toISOString(),
                    duration: record.get('duration'),
                    babyId: record.get('babyId')
                };
                onRecordUpdate && onRecordUpdate(recordData);
            });

            // 记录删除时
            liveQuery.on('delete', (record) => {
                onRecordDelete && onRecordDelete(record.id);
            });

            return liveQuery;
        } catch (error) {
            console.error('设置实时查询失败:', error);
            throw error;
        }
    }

    static async setupBabyLiveQuery(onBabyCreate, onBabyUpdate, onBabyDelete) {
        try {
            const Baby = window.AV.Object.extend('Baby');
            const query = new window.AV.Query(Baby);
            query.equalTo('user', window.AV.User.current());
            
            const liveQuery = await query.subscribe();
            
            // 新宝宝创建时
            liveQuery.on('create', (baby) => {
                const babyData = {
                    id: baby.get('cloudId'),
                    name: baby.get('name'),
                    birthday: baby.get('birthday')
                };
                onBabyCreate && onBabyCreate(babyData);
            });

            // 宝宝信息更新时
            liveQuery.on('update', (baby) => {
                const babyData = {
                    id: baby.get('cloudId'),
                    name: baby.get('name'),
                    birthday: baby.get('birthday')
                };
                onBabyUpdate && onBabyUpdate(babyData);
            });

            // 宝宝删除时
            liveQuery.on('delete', (baby) => {
                onBabyDelete && onBabyDelete(baby.get('cloudId'));
            });

            return liveQuery;
        } catch (error) {
            console.error('设置宝宝实时查询失败:', error);
            throw error;
        }
    }

    // 保存用户设置
    static async saveUserSettings(settings) {
        try {
            // 检查用户是否已登录
            const currentUser = window.AV.User.current();
            if (!currentUser) {
                console.error('保存设置失败: 用户未登录');
                return { 
                    success: false, 
                    error: '请先登录，您的设置将仅保存在本地',
                    settings: settings // 返回原始设置，方便本地备份
                };
            }
            
            // 检查会话令牌是否有效
            const sessionToken = currentUser._sessionToken;
            if (!sessionToken) {
                console.error('保存设置失败: 用户会话已过期');
                return { 
                    success: false, 
                    error: '您的登录已过期，请重新登录。设置将仅保存在本地',
                    settings: settings // 返回原始设置，方便本地备份
                };
            }

            console.log('准备保存用户设置:', settings);

            const UserSettings = window.AV.Object.extend('UserSettings');
            const query = new window.AV.Query(UserSettings);
            query.equalTo('user', currentUser);
            let existingSettings;
            
            try {
                existingSettings = await query.first();
                console.log('查询现有设置结果:', existingSettings ? '找到现有设置' : '没有现有设置');
            } catch (queryError) {
                console.error('查询现有设置失败:', queryError);
                // 查询失败时，尝试创建新设置，但先记录错误
                return { 
                    success: false, 
                    error: '查询现有设置失败: ' + (queryError.message || '未知错误'),
                    settings: settings // 返回原始设置，方便本地备份
                };
            }

            let userSettings;
            if (existingSettings) {
                console.log('更新已存在的用户设置');
                userSettings = existingSettings;
            } else {
                console.log('创建新的用户设置');
                userSettings = new UserSettings();
                userSettings.set('user', currentUser);
            }

            // 保存设置信息
            Object.keys(settings).forEach(key => {
                userSettings.set(key, settings[key]);
            });

            try {
                await userSettings.save();
                console.log('用户设置保存成功');
                return { 
                    success: true,
                    settings: settings
                };
            } catch (saveError) {
                console.error('保存设置到云端失败:', saveError);
                return {
                    success: false,
                    error: saveError.message || '保存到云端失败',
                    settings: settings // 返回原始设置，方便本地备份
                };
            }
        } catch (error) {
            console.error('保存用户设置失败:', error);
            return { 
                success: false, 
                error: error.message || '保存失败，请重试',
                settings: settings // 返回原始设置，方便本地备份
            };
        }
    }

    static async getUserSettings() {
        try {
            // 检查用户是否已登录
            const currentUser = window.AV.User.current();
            if (!currentUser) {
                console.error('获取设置失败: 用户未登录');
                return { 
                    success: false, 
                    error: '请先登录，将使用默认设置', 
                    settings: {}  // 确保返回空设置对象
                };
            }
            
            // 检查会话令牌是否有效
            const sessionToken = currentUser._sessionToken;
            if (!sessionToken) {
                console.error('获取设置失败: 用户会话已过期');
                return { 
                    success: false, 
                    error: '您的登录已过期，请重新登录。将使用默认设置', 
                    settings: {}  // 确保返回空设置对象
                };
            }

            console.log('准备获取用户设置');

            const UserSettings = window.AV.Object.extend('UserSettings');
            const query = new window.AV.Query(UserSettings);
            query.equalTo('user', currentUser);
            
            try {
                const userSettings = await query.first();

                if (userSettings) {
                    const settings = {};
                    // 获取所有保存的设置
                    const attributes = userSettings.attributes;
                    Object.keys(attributes).forEach(key => {
                        if (key !== 'user' && key !== 'createdAt' && key !== 'updatedAt' && key !== 'ACL') {
                            settings[key] = attributes[key];
                        }
                    });
                    
                    console.log('成功获取到用户设置:', settings);
                    return { 
                        success: true,
                        settings: settings
                    };
                } else {
                    console.log('未找到用户设置，返回默认值');
                    return {
                        success: true,
                        settings: {} // 返回空对象作为默认设置
                    };
                }
            } catch (queryError) {
                console.error('查询用户设置时出错:', queryError);
                return { 
                    success: false, 
                    error: queryError.message || '查询失败',
                    settings: {} // 查询出错时也返回空对象
                };
            }
        } catch (error) {
            console.error('获取用户设置失败:', error);
            return { 
                success: false, 
                error: error.message || '获取失败，请重试',
                settings: {} // 发生错误时也返回空对象
            };
        }
    }
}

export default CloudService; 
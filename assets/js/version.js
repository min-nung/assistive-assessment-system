// Add each new release to the beginning of this list so the app can display
// both the current version and its update history.
const VERSION_HISTORY = Object.freeze([
  Object.freeze({
    version: '1.4',
    date: '2026-07-27',
    title: '雲端備份',
    updates: Object.freeze([
      '設定選單新增「雲端備份」，可連結 Google 帳號，將個案資料自動備份到你自己的 Google Drive。',
      '停止操作幾秒後自動上傳完整快照，不需手動按任何按鈕；切換應用程式或鎖定螢幕時會立即補傳。',
      '新裝置登入同一個 Google 帳號後，可將雲端快照載回本機，載入前會先確認並自動匯出本機資料保險。',
      '偵測到另一台裝置寫入過較新的資料時會停下來詢問，絕不自動覆蓋或合併，可選擇保留本機、採用雲端或先不決定。',
      '資料備份面板新增雲端備份狀態摘要，一眼看出目前是否受到保護；雲端備份正常運作時不再重複顯示 7 天手動備份提醒，雲端備份停止運作過久則會主動提醒。',
      '雲端備份為額外保險，不影響離線使用，也未取代原有的手動 JSON 匯出／匯入功能。'
    ])
  }),
  Object.freeze({
    version: '1.3',
    date: '2026-07-23',
    title: '建議輔具移至表單頂部',
    updates: Object.freeze([
      '移位輔具、輪椅座墊、氣墊床／電動床、輪椅及沐浴椅／便盆椅的建議輔具移至頁面最上方。',
      '原「評估結果」欄位統一更名為「建議輔具」，並移除前方編號。',
      '輪椅建議尺寸移至建議輔具下方，方便立即查看。',
      '帶輪型助步車移除單一結果選項，填有評估資料時自動納入建議與補助試算。'
    ])
  }),
  Object.freeze({
    version: '1.2',
    date: '2026-07-23',
    title: '改善個案與沐浴椅操作',
    updates: Object.freeze([
      '選擇評估項目頁面的個案名稱旁新增修改圖示。',
      '可直接修改個案名稱，並檢查空白、字數上限與重複名稱。',
      '沐浴椅／便盆椅的附加功能改為逐項條列勾選，不再使用累加等級。',
      '補助試算會依實際勾選的附加功能組合計算。'
    ])
  }),
  Object.freeze({
    version: '1.1',
    date: '2026-07-23',
    title: '新增版本追蹤',
    updates: Object.freeze([
      '首頁右上角新增設定選單，保留原有的資料備份功能。',
      '新增「目前版本」，可查看版本號、更新日期與更新項目。',
      '版本資料集中管理，方便後續持續新增更新紀錄。'
    ])
  })
]);

const CURRENT_VERSION = VERSION_HISTORY[0];

function formatVersionDate(date) {
  const [year, month, day] = date.split('-');
  return `${year}年${Number(month)}月${Number(day)}日`;
}

function renderVersionInfo() {
  const host = document.getElementById('versionContent');
  if (!host || !CURRENT_VERSION) return;

  const current = document.createElement('div');
  current.className = 'version-current';

  const number = document.createElement('div');
  number.className = 'version-number';
  number.textContent = `v${CURRENT_VERSION.version}`;

  const date = document.createElement('div');
  date.className = 'version-date';
  date.textContent = `更新日期：${formatVersionDate(CURRENT_VERSION.date)}`;

  current.append(number, date);

  const releases = VERSION_HISTORY.map(release => {
    const section = document.createElement('section');
    section.className = 'version-release';

    const heading = document.createElement('div');
    heading.className = 'version-release-title';

    const title = document.createElement('strong');
    title.textContent = release.title;

    const time = document.createElement('time');
    time.dateTime = release.date;
    time.textContent = `v${release.version}`;

    const list = document.createElement('ul');
    list.className = 'version-updates';
    release.updates.forEach(update => {
      const item = document.createElement('li');
      item.textContent = update;
      list.appendChild(item);
    });

    heading.append(title, time);
    section.append(heading, list);
    return section;
  });

  host.replaceChildren(current, ...releases);
}

export { CURRENT_VERSION, VERSION_HISTORY, renderVersionInfo };

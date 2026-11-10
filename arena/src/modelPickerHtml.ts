export const MODEL_PICKER_HTML = `<fieldset class="model-picker" id="modelPicker"><legend>选择参赛模型</legend>
  <input type="hidden" name="models" id="launchModels"><input type="hidden" name="freeOnly" value="1">
  <div class="catalog-heading"><div><strong>勾选模型，加入对战</strong></div><button type="button" id="addCustomModel" class="quiet-button" disabled>＋ 添加模型</button></div>
  <div class="catalog-connection"><span id="catalogStatus" class="muted" role="status">正在同步 OpenRouter 目录…</span><div class="router-actions"><button type="button" id="routerCheck" class="text-button" disabled title="使用已保存的 Key 检测一次免费接口，最多一次短请求">检测免费接口</button><button type="button" id="routerSettings" class="text-button">连接设置</button></div></div>
  <p id="routerAvailability" class="router-availability" role="status" hidden></p>
  <div class="model-tabs" role="group" aria-label="模型来源"><button type="button" data-model-source="all" aria-pressed="true">全部模型</button><button type="button" data-model-source="custom" aria-pressed="false">自定义</button><button type="button" data-model-source="hidden" aria-pressed="false">已隐藏</button></div>
  <div class="lineup-presets" role="group" aria-label="模型对战组">
    <div class="preset-toolbar"><label for="lineupPreset">对战组</label><select id="lineupPreset" aria-describedby="lineupPresetStatus" title="选择对战组，替换本场阵容"><option value="">临时阵容</option></select><button type="button" id="saveLineupPreset" class="quiet-button" disabled>＋ 保存阵容</button><button type="button" id="updateLineupPreset" class="quiet-button" hidden>更新</button><button type="button" id="manageLineupPreset" class="text-button" hidden>管理</button></div>
    <p id="lineupPresetStatus" class="preset-status" role="status">选择模型后保存成组，下次一键载入 · 本机保存</p>
  </div>
  <div class="model-toolbar"><input type="search" id="modelSearch" placeholder="搜索名称或模型 ID…" aria-label="搜索参赛模型" autocomplete="off"><select id="modelProvider" aria-label="筛选模型厂商"><option value="">全部厂商</option></select><button type="button" id="refreshModels" class="quiet-button" title="重新获取 OpenRouter 官方目录">刷新</button></div>
  <div id="modelList" class="model-list" aria-label="可选参赛模型"><p class="model-empty">正在加载模型…</p></div>
  <div class="catalog-note" id="catalogNote">免费指目录中输入、输出及其它列出的计价项目为 $0。仍受账号额度和服务限流影响。<a href="https://openrouter.ai/docs/api/reference/limits" target="_blank" rel="noreferrer">免费额度说明 ↗</a></div>
  <p id="modelActionStatus" class="muted" role="status" hidden></p>
</fieldset>`;

export const MODEL_DIALOGS_HTML = `<dialog id="routerDialog" class="model-dialog" aria-labelledby="routerDialogTitle"><form id="routerConfigForm">
  <div class="dialog-heading"><div><h2 id="routerDialogTitle">连接 OpenRouter</h2></div><button type="button" data-close-dialog class="quiet-button" aria-label="关闭 OpenRouter 配置">×</button></div>
  <p class="dialog-intro">配置一次 API Key，即可选择目录中的免费模型。接口地址已内置，目录会自动更新。</p>
  <label class="field">API Key<input id="routerApiKey" type="password" autocomplete="new-password" placeholder="sk-or-…" maxlength="8192"></label>
  <p id="routerKeyStatus" class="muted"></p><label class="check-label" id="clearRouterKeyLabel" hidden><input type="checkbox" id="clearRouterKey">移除本机保存的 Key</label>
  <fieldset class="source-settings"><legend>名单来源</legend>
    <label class="check-label"><input type="checkbox" id="showOpenRouterModels" checked>在模型名单中显示 OpenRouter 免费目录</label>
    <label class="check-label"><input type="checkbox" id="showBuiltinModels" checked>在模型名单中显示内置目录模型</label>
    <p class="catalog-note">关掉的来源不再进入名单，连接配置保留，随时可开回来。</p>
  </fieldset>
  <p class="catalog-note">Key 仅保存在本机服务端，不写入浏览器存储或战报。<a href="https://openrouter.ai/settings/keys" target="_blank" rel="noreferrer">获取 API Key ↗</a></p>
  <p id="routerFormMessage" class="model-message" role="status" hidden></p><div class="dialog-actions"><button type="button" data-close-dialog class="quiet-button">取消</button><button type="submit">保存连接</button></div>
</form></dialog>
<dialog id="customModelDialog" class="model-dialog" aria-labelledby="customModelTitle"><form id="customModelForm">
  <div class="dialog-heading"><div><h2 id="customModelTitle">添加自定义模型</h2></div><button type="button" data-close-dialog class="quiet-button" aria-label="关闭自定义模型配置">×</button></div>
  <p class="dialog-intro">连接 OpenAI 兼容接口或本地模型服务。自定义模型的费用由对应服务决定。</p>
  <label class="field">显示名称<input id="customModelName" required maxlength="80" placeholder="例如：我的本地 Qwen"></label>
  <label class="field">接口地址<input id="customModelUrl" type="url" required maxlength="2000" placeholder="http://localhost:11434/v1"></label>
  <label class="field">模型 ID<input id="customModelId" required maxlength="200" placeholder="填写服务端实际使用的模型 ID" spellcheck="false"></label>
  <label class="field">API Key <span class="muted">本地免认证服务可留空</span><input id="customModelKey" type="password" autocomplete="new-password" maxlength="8192"></label>
  <p id="customKeyStatus" class="muted"></p><label class="check-label" id="clearCustomKeyLabel" hidden><input type="checkbox" id="clearCustomKey">移除已保存的 Key</label>
  <label class="check-label"><input type="checkbox" id="customModelStream" checked>启用流式输出</label>
  <p id="customFormMessage" class="model-message" role="status" hidden></p>
  <div class="dialog-actions"><button type="button" id="deleteCustomModel" class="danger-button" hidden>删除模型</button><button type="button" data-close-dialog class="quiet-button">取消</button><button type="submit">保存模型</button></div>
</form></dialog>
<dialog id="catalogModelDialog" class="model-dialog" aria-labelledby="catalogModelTitle"><form id="catalogModelForm">
  <div class="dialog-heading"><h2 id="catalogModelTitle">编辑显示名称</h2><button type="button" data-close-dialog class="quiet-button" aria-label="关闭模型编辑">×</button></div>
  <p class="dialog-intro">名称只在本机显示，实际调用的模型 ID 保持不变。</p><code id="catalogModelId" class="dialog-model-id"></code>
  <label class="field">显示名称<input id="catalogModelName" maxlength="80" placeholder="留空使用官方名称"></label><button type="button" id="resetModelName" class="text-button">恢复官方名称</button>
  <p id="catalogFormMessage" class="model-message" role="status" hidden></p><div class="dialog-actions"><button type="button" data-close-dialog class="quiet-button">取消</button><button type="submit">保存名称</button></div>
</form></dialog>
<dialog id="deleteModelDialog" class="model-dialog" aria-labelledby="deleteModelTitle"><form id="deleteModelForm">
  <div class="dialog-heading"><h2 id="deleteModelTitle">删除自定义模型</h2><button type="button" data-close-dialog class="quiet-button" aria-label="取消删除模型">×</button></div>
  <p class="dialog-intro">删除 <strong id="deleteModelName"></strong> 的本机连接配置。已完成的对战和历史战报会保留。</p>
  <p id="deleteFormMessage" class="model-message" role="status" hidden></p><div class="dialog-actions"><button type="button" data-close-dialog class="quiet-button">取消</button><button type="submit" class="danger-button">确认删除</button></div>
</form></dialog>
<dialog id="lineupPresetDialog" class="model-dialog" aria-labelledby="lineupPresetTitle"><form id="lineupPresetForm">
  <div class="dialog-heading"><div><h2 id="lineupPresetTitle">保存对战组</h2></div><button type="button" data-close-dialog class="quiet-button" aria-label="关闭对战组设置">×</button></div>
  <p id="lineupPresetIntro" class="dialog-intro"></p><label class="field">对战组名称<input id="lineupPresetName" required maxlength="40" autocomplete="off" placeholder="例如：免费主力、推理对照"></label>
  <p id="lineupPresetMessage" class="model-message" role="status" hidden></p><div class="dialog-actions"><button type="button" id="deleteLineupPreset" class="danger-button" hidden>删除对战组</button><button type="button" data-close-dialog class="quiet-button">取消</button><button type="submit" id="submitLineupPreset">保存对战组</button></div>
</form></dialog>`;

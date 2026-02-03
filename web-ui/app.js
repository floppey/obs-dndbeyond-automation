/**
 * OBS D&D Beyond Rules Configuration UI
 * Visual Rule Editor with comprehensive form builder
 */

// ============ CONDITION & ACTION SCHEMAS ============
const CONDITION_SCHEMAS = {
  // HP conditions - comparison type
  hp_percentage: { label: "HP Percentage", fields: ["operator", "value"], valueHint: "0-100" },
  hp_value: { label: "HP Value", fields: ["operator", "value"], valueHint: "Current HP amount" },
  hp_temp: { label: "Temporary HP", fields: ["operator", "value"], valueHint: "Temp HP amount" },
  hp_missing: { label: "HP Missing", fields: ["operator", "value"], valueHint: "Max - Current HP" },
  
  // Death conditions
  is_dead: { label: "Is Dead", fields: ["boolean"] },
  is_unconscious: { label: "Is Unconscious", fields: ["boolean"] },
  death_saves_success: { label: "Death Save Successes", fields: ["operator", "value"], valueHint: "0-3" },
  death_saves_failure: { label: "Death Save Failures", fields: ["operator", "value"], valueHint: "0-3" },
  
  // Equipment conditions
  item_equipped: { label: "Item Equipped", fields: ["itemName", "matchPartial"] },
  item_attuned: { label: "Item Attuned", fields: ["itemName", "matchPartial"] },
  armor_equipped: { label: "Armor Equipped", fields: ["boolean"] },
  shield_equipped: { label: "Shield Equipped", fields: ["boolean"] },
  
  // Level conditions
  level: { label: "Character Level", fields: ["operator", "value"] },
  class_level: { label: "Class Level", fields: ["className", "operator", "value"] },
  has_class: { label: "Has Class", fields: ["className", "boolean"] },
  
  // Constants
  always: { label: "Always (Default)", fields: [] },
  never: { label: "Never", fields: [] },
};

const ACTION_SCHEMAS = {
  set_image: { label: "Set Image", fields: ["sourceName", "imagePath"] },
  set_visibility: { label: "Set Visibility", fields: ["sceneName", "itemName", "visible"] },
  set_text: { label: "Set Text", fields: ["sourceName", "text"] },
  set_filter_visibility: { label: "Set Filter Visibility", fields: ["sourceName", "filterName", "visible"] },
};

const VARIABLE_HINTS = {
  text: "{currentHp}, {maxHp}, {hpPercentage}, {tempHp}, {isDead}, {isUnconscious}, {level}, {className}"
};

// ============ RULE EDITOR STATE ============
let rulesConfig = { version: "1.0", ruleLists: [] };
let characterState = null;
let eventSource = null;
let editingRule = null; // { listIndex, ruleIndex, draft }

// DOM Elements
const connectionStatus = document.getElementById("connectionStatus");
const characterStateEl = document.getElementById("characterState");
const rulesEditor = document.getElementById("rulesEditor");
const toastContainer = document.getElementById("toastContainer");

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  loadRules();
  connectSSE();
  setupEventListeners();
});

// ============ RULE MANAGEMENT ============

// Load rules from server
async function loadRules() {
  try {
    const response = await fetch("/api/rules");
    rulesConfig = await response.json();
    renderRules();
    showToast("Rules loaded", "success");
  } catch (error) {
    console.error("Failed to load rules:", error);
    showToast("Failed to load rules", "error");
  }
}

// Save rules to server
async function saveRules() {
  try {
    const response = await fetch("/api/rules", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rulesConfig),
    });
    const result = await response.json();
    if (result.success) {
      showToast("Rules saved successfully!", "success");
    } else {
      showToast(`Failed to save: ${result.error}`, "error");
    }
  } catch (error) {
    console.error("Failed to save rules:", error);
    showToast("Failed to save rules", "error");
  }
}

// Connect to Server-Sent Events for live updates
function connectSSE() {
  updateConnectionStatus("connecting");
  
  eventSource = new EventSource("/api/events");
  
  eventSource.onopen = () => {
    updateConnectionStatus("connected");
  };
  
  eventSource.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      if (message.type === "state" && message.data) {
        characterState = message.data;
        renderCharacterState();
      }
    } catch (error) {
      console.error("Failed to parse SSE message:", error);
    }
  };
  
  eventSource.onerror = () => {
    updateConnectionStatus("disconnected");
    // Reconnect after 5 seconds
    setTimeout(() => {
      if (eventSource) {
        eventSource.close();
      }
      connectSSE();
    }, 5000);
  };
}

// Update connection status indicator
function updateConnectionStatus(status) {
  const dot = connectionStatus.querySelector(".status-dot");
  const text = connectionStatus.querySelector(".status-text");
  
  dot.className = "status-dot " + status;
  
  switch (status) {
    case "connected":
      text.textContent = "Connected";
      break;
    case "disconnected":
      text.textContent = "Disconnected";
      break;
    default:
      text.textContent = "Connecting...";
  }
}

// ============ CHARACTER STATE RENDERING ============

// Render character state panel
function renderCharacterState() {
  if (!characterState) {
    characterStateEl.innerHTML = '<div class="state-loading">Waiting for character data...</div>';
    return;
  }
  
  const { hp, isDead, deathSaves, inventory, level } = characterState;
  const hpClass = getHpClass(hp.percentage);
  
  characterStateEl.innerHTML = `
    <div class="hp-bar-container">
      <div class="hp-bar-label">
        <span>HP</span>
        <span>${hp.current}/${hp.max} ${hp.temp > 0 ? `(+${hp.temp} temp)` : ""}</span>
      </div>
      <div class="hp-bar">
        <div class="hp-bar-fill ${hpClass}" style="width: ${hp.percentage}%"></div>
      </div>
    </div>
    
    <div class="stat-grid">
      <div class="stat-item">
        <div class="stat-label">HP %</div>
        <div class="stat-value">${hp.percentage}%</div>
      </div>
      <div class="stat-item">
        <div class="stat-label">Level</div>
        <div class="stat-value">${level}</div>
      </div>
      <div class="stat-item">
        <div class="stat-label">Status</div>
        <div class="stat-value">${isDead ? "💀 Dead" : hp.current === 0 ? "😵 Unconscious" : "✓ Alive"}</div>
      </div>
      <div class="stat-item">
        <div class="stat-label">Death Saves</div>
        <div class="stat-value">${"✓".repeat(deathSaves.successes)}${"✗".repeat(deathSaves.failures) || "-"}</div>
      </div>
    </div>
    
    ${inventory.length > 0 ? `
      <div class="inventory-section">
        <div class="stat-label" style="margin-bottom: 8px;">Equipped Items</div>
        <div class="inventory-list">
          ${inventory.filter(i => i.equipped || i.attuned).map(item => `
            <div class="inventory-item">
              <span>${item.name}</span>
              <div class="inventory-badges">
                ${item.equipped ? '<span class="badge equipped">E</span>' : ''}
                ${item.attuned ? '<span class="badge attuned">A</span>' : ''}
              </div>
            </div>
          `).join("")}
        </div>
      </div>
    ` : ""}
  `;
}

// Get HP bar color class
function getHpClass(percentage) {
  if (percentage <= 10) return "critical";
  if (percentage <= 25) return "dying";
  if (percentage <= 50) return "bloodied";
  if (percentage <= 75) return "scratched";
  return "healthy";
}

// ============ RULES RENDERING ============

// Render rules editor
function renderRules() {
  if (!rulesConfig.ruleLists || rulesConfig.ruleLists.length === 0) {
    rulesEditor.innerHTML = '<div class="state-loading">No rule lists configured. Click "Add Rule List" to create one.</div>';
    return;
  }
  
  rulesEditor.innerHTML = rulesConfig.ruleLists.map((ruleList, listIndex) => `
    <div class="rule-list ${ruleList._expanded ? 'expanded' : ''}" data-list-index="${listIndex}">
      <div class="rule-list-header" onclick="toggleRuleList(${listIndex})">
        <div class="rule-list-title">
          <span class="chevron">▼</span>
          <input type="text" value="${escapeHtml(ruleList.name)}" onclick="event.stopPropagation()" onchange="updateRuleListName(${listIndex}, this.value)">
          <span style="color: var(--text-secondary); font-size: 0.85rem;">(${ruleList.rules.length} rules)</span>
        </div>
        <div class="rule-list-controls" onclick="event.stopPropagation()">
          <label class="toggle">
            <input type="checkbox" ${ruleList.enabled !== false ? 'checked' : ''} onchange="toggleRuleListEnabled(${listIndex}, this.checked)">
            <span class="toggle-slider"></span>
          </label>
          <button class="btn btn-icon" onclick="deleteRuleList(${listIndex})" title="Delete rule list">🗑️</button>
        </div>
      </div>
      <div class="rule-list-body">
        <div class="rule-list-meta">
          <label>
            Mode:
            <select onchange="updateRuleListMode(${listIndex}, this.value)">
              <option value="first_match" ${ruleList.mode === 'first_match' ? 'selected' : ''}>First Match</option>
              <option value="all_matches" ${ruleList.mode === 'all_matches' ? 'selected' : ''}>All Matches</option>
            </select>
          </label>
          <label>
            ID: <code>${ruleList.id}</code>
          </label>
        </div>
        <div class="rules-container">
          ${ruleList.rules.map((rule, ruleIndex) => renderRule(rule, listIndex, ruleIndex)).join("")}
        </div>
        <button class="btn btn-add" onclick="addRule(${listIndex})">+ Add Rule</button>
      </div>
    </div>
  `).join("");
}

// Render individual rule
function renderRule(rule, listIndex, ruleIndex) {
  return `
    <div class="rule ${rule.enabled === false ? 'disabled' : ''} ${rule._expanded ? 'expanded' : ''}" data-rule-index="${ruleIndex}">
      <div class="rule-header" onclick="toggleRule(${listIndex}, ${ruleIndex})">
        <div class="rule-title">
          <span class="chevron">▶</span>
          <span class="rule-name">${escapeHtml(rule.name || rule.id)}</span>
          ${rule.priority ? `<span class="rule-priority">P: ${rule.priority}</span>` : ''}
        </div>
        <div onclick="event.stopPropagation()">
          <label class="toggle">
            <input type="checkbox" ${rule.enabled !== false ? 'checked' : ''} onchange="toggleRuleEnabled(${listIndex}, ${ruleIndex}, this.checked)">
            <span class="toggle-slider"></span>
          </label>
          <button class="btn btn-icon" onclick="openRuleEditor(${listIndex}, ${ruleIndex})" title="Edit rule">✏️</button>
          <button class="btn btn-icon" onclick="deleteRule(${listIndex}, ${ruleIndex})" title="Delete rule">🗑️</button>
        </div>
      </div>
      <div class="rule-body">
        <div class="rule-section">
          <div class="rule-section-title">Condition</div>
          <div class="condition-display">${formatCondition(rule.condition)}</div>
        </div>
        <div class="rule-section">
          <div class="rule-section-title">Actions (${rule.actions.length})</div>
          <div class="actions-list">
            ${rule.actions.map(action => `
              <div class="action-item">
                <span class="action-type">${action.type}</span>: ${formatAction(action)}
              </div>
            `).join("")}
          </div>
        </div>
      </div>
    </div>
  `;
}

// Format condition for display
function formatCondition(condition) {
  if (condition === null) return "Always (no condition)";
  if (condition && (condition.operator === "AND" || condition.operator === "OR")) {
    return `${condition.operator}:\n  ${condition.conditions.map(c => formatCondition(c)).join(`\n  `)}`;
  }
  return JSON.stringify(condition, null, 2);
}

// Format action for display
function formatAction(action) {
  switch (action.type) {
    case "set_image":
      return `${action.sourceName} → ${action.imagePath}`;
    case "set_visibility":
      return `${action.sceneName}/${action.itemName} → ${action.visible ? "show" : "hide"}`;
    case "set_text":
      return `${action.sourceName} → "${action.text}"`;
    case "set_filter_visibility":
      return `${action.sourceName}[${action.filterName}] → ${action.visible ? "enable" : "disable"}`;
    default:
      return JSON.stringify(action);
  }
}

// ============ RULE LIST MANAGEMENT ============

// Toggle rule list expanded state
function toggleRuleList(listIndex) {
  rulesConfig.ruleLists[listIndex]._expanded = !rulesConfig.ruleLists[listIndex]._expanded;
  renderRules();
}

// Toggle rule expanded state
function toggleRule(listIndex, ruleIndex) {
  rulesConfig.ruleLists[listIndex].rules[ruleIndex]._expanded = !rulesConfig.ruleLists[listIndex].rules[ruleIndex]._expanded;
  renderRules();
}

// Update rule list name
function updateRuleListName(listIndex, name) {
  rulesConfig.ruleLists[listIndex].name = name;
}

// Toggle rule list enabled
function toggleRuleListEnabled(listIndex, enabled) {
  rulesConfig.ruleLists[listIndex].enabled = enabled;
}

// Update rule list mode
function updateRuleListMode(listIndex, mode) {
  rulesConfig.ruleLists[listIndex].mode = mode;
}

// Toggle rule enabled
function toggleRuleEnabled(listIndex, ruleIndex, enabled) {
  rulesConfig.ruleLists[listIndex].rules[ruleIndex].enabled = enabled;
}

// Delete rule list
function deleteRuleList(listIndex) {
  if (confirm("Delete this rule list?")) {
    rulesConfig.ruleLists.splice(listIndex, 1);
    renderRules();
  }
}

// Delete rule
function deleteRule(listIndex, ruleIndex) {
  if (confirm("Delete this rule?")) {
    rulesConfig.ruleLists[listIndex].rules.splice(ruleIndex, 1);
    renderRules();
  }
}

// Add new rule list
function addRuleList() {
  const id = "rule-list-" + Date.now();
  rulesConfig.ruleLists.push({
    id,
    name: "New Rule List",
    enabled: true,
    mode: "first_match",
    rules: [],
    _expanded: true,
  });
  renderRules();
}

// Add new rule
function addRule(listIndex) {
  const id = "rule-" + Date.now();
  rulesConfig.ruleLists[listIndex].rules.push({
    id,
    name: "New Rule",
    enabled: true,
    condition: null,
    actions: [],
    _expanded: true,
  });
  renderRules();
  // Open editor immediately for new rule
  openRuleEditor(listIndex, rulesConfig.ruleLists[listIndex].rules.length - 1);
}

// ============ RULE EDITOR MODAL ============

// Open rule editor modal
function openRuleEditor(listIndex, ruleIndex) {
  const rule = rulesConfig.ruleLists[listIndex].rules[ruleIndex];
  
  // Create a deep copy for draft editing
  editingRule = {
    listIndex,
    ruleIndex,
    draft: JSON.parse(JSON.stringify(rule))
  };
  
  // Initialize form with rule data
  document.getElementById("ruleEditorName").value = editingRule.draft.name || "";
  document.getElementById("ruleEditorPriority").value = editingRule.draft.priority || 0;
  document.getElementById("ruleEditorEnabled").checked = editingRule.draft.enabled !== false;
  
  // Render condition builder
  renderConditionBuilder();
  
  // Render action builder
  renderActionBuilder();
  
  // Show modal
  document.getElementById("ruleEditorModal").classList.add("active");
}

// Close rule editor
function closeRuleEditor() {
  editingRule = null;
  document.getElementById("ruleEditorModal").classList.remove("active");
  clearAdvancedJsonEditor();
}

// Save rule from editor
function saveRuleFromEditor() {
  // Validate
  const name = document.getElementById("ruleEditorName").value.trim();
  if (!name) {
    showToast("Rule name is required", "error");
    return;
  }
  
  // Update draft with form values
  editingRule.draft.name = name;
  editingRule.draft.priority = parseInt(document.getElementById("ruleEditorPriority").value) || 0;
  editingRule.draft.enabled = document.getElementById("ruleEditorEnabled").checked;
  
  // Build condition from editor
  editingRule.draft.condition = buildConditionFromEditor();
  
  // Build actions from editor
  editingRule.draft.actions = buildActionsFromEditor();
  
  // Save to main config
  rulesConfig.ruleLists[editingRule.listIndex].rules[editingRule.ruleIndex] = editingRule.draft;
  
  // Close editor and refresh
  closeRuleEditor();
  renderRules();
  showToast("Rule saved", "success");
}

// ============ CONDITION BUILDER ============

function renderConditionBuilder() {
  const conditionBuilder = document.getElementById("conditionBuilder");
  const condition = editingRule.draft.condition;
  
  if (!condition || condition.type === "always" || !condition.operator) {
    // Single condition mode
    conditionBuilder.innerHTML = `
      <div class="condition-item">
        <div class="form-group">
          <label for="conditionType">Condition Type</label>
          <select id="conditionType" class="form-select" onchange="updateConditionType()">
            <optgroup label="HP">
              <option value="always" ${!condition ? 'selected' : ''}>Always (Default)</option>
              <option value="hp_percentage" ${condition?.type === 'hp_percentage' ? 'selected' : ''}>HP Percentage</option>
              <option value="hp_value" ${condition?.type === 'hp_value' ? 'selected' : ''}>HP Value</option>
              <option value="hp_temp" ${condition?.type === 'hp_temp' ? 'selected' : ''}>Temporary HP</option>
              <option value="hp_missing" ${condition?.type === 'hp_missing' ? 'selected' : ''}>HP Missing</option>
            </optgroup>
            <optgroup label="Death">
              <option value="is_dead" ${condition?.type === 'is_dead' ? 'selected' : ''}>Is Dead</option>
              <option value="is_unconscious" ${condition?.type === 'is_unconscious' ? 'selected' : ''}>Is Unconscious</option>
              <option value="death_saves_success" ${condition?.type === 'death_saves_success' ? 'selected' : ''}>Death Save Successes</option>
              <option value="death_saves_failure" ${condition?.type === 'death_saves_failure' ? 'selected' : ''}>Death Save Failures</option>
            </optgroup>
            <optgroup label="Equipment">
              <option value="item_equipped" ${condition?.type === 'item_equipped' ? 'selected' : ''}>Item Equipped</option>
              <option value="item_attuned" ${condition?.type === 'item_attuned' ? 'selected' : ''}>Item Attuned</option>
              <option value="armor_equipped" ${condition?.type === 'armor_equipped' ? 'selected' : ''}>Armor Equipped</option>
              <option value="shield_equipped" ${condition?.type === 'shield_equipped' ? 'selected' : ''}>Shield Equipped</option>
            </optgroup>
            <optgroup label="Level">
              <option value="level" ${condition?.type === 'level' ? 'selected' : ''}>Character Level</option>
              <option value="class_level" ${condition?.type === 'class_level' ? 'selected' : ''}>Class Level</option>
              <option value="has_class" ${condition?.type === 'has_class' ? 'selected' : ''}>Has Class</option>
            </optgroup>
            <optgroup label="Special">
              <option value="never" ${condition?.type === 'never' ? 'selected' : ''}>Never</option>
            </optgroup>
          </select>
        </div>
        <div id="conditionFields"></div>
      </div>
    `;
    
    renderConditionFields(condition);
  } else if (condition.operator === "AND" || condition.operator === "OR") {
    // Group mode
    renderConditionGroup(condition);
  }
}

function renderConditionFields(condition) {
  const fieldsContainer = document.getElementById("conditionFields");
  const condType = document.getElementById("conditionType").value;
  const schema = CONDITION_SCHEMAS[condType];
  
  if (!schema || schema.fields.length === 0) {
    fieldsContainer.innerHTML = "";
    return;
  }
  
  let html = '<div class="condition-type-fields">';
  
  for (const field of schema.fields) {
    if (field === "operator") {
      html += `
        <div class="form-group">
          <label for="conditionOperator">Operator</label>
          <select id="conditionOperator" class="form-select">
            <option value=">" ${condition?.operator === '>' ? 'selected' : ''}>Greater Than (>)</option>
            <option value=">=" ${condition?.operator === '>=' ? 'selected' : ''}>Greater or Equal (>=)</option>
            <option value="<" ${condition?.operator === '<' ? 'selected' : ''}>Less Than (<)</option>
            <option value="<=" ${condition?.operator === '<=' ? 'selected' : ''}>Less or Equal (<=)</option>
            <option value="==" ${condition?.operator === '==' ? 'selected' : ''}>Equal (==)</option>
            <option value="!=" ${condition?.operator === '!=' ? 'selected' : ''}>Not Equal (!=)</option>
          </select>
        </div>
      `;
    } else if (field === "value") {
      html += `
        <div class="form-group">
          <label for="conditionValue">Value</label>
          <input type="number" id="conditionValue" class="form-input" value="${condition?.value || ''}" placeholder="e.g., 50">
          <small class="form-hint">${schema.valueHint || ''}</small>
        </div>
      `;
    } else if (field === "boolean") {
      html += `
        <div class="form-group">
          <label>Value</label>
          <label class="toggle" style="margin-top: 8px;">
            <input type="checkbox" id="conditionBoolean" ${condition?.value ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>
      `;
    } else if (field === "itemName") {
      html += `
        <div class="form-group">
          <label for="conditionItemName">Item Name</label>
          <input type="text" id="conditionItemName" class="form-input" value="${condition?.itemName || ''}" placeholder="e.g., Sword of Flame">
          <small class="form-hint">Exact or partial item name</small>
        </div>
      `;
    } else if (field === "matchPartial") {
      html += `
        <div class="form-group">
          <label>Match Type</label>
          <label class="toggle" style="margin-top: 8px;" title="When checked, matches partial item names">
            <input type="checkbox" id="conditionMatchPartial" ${condition?.matchPartial ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
          <small class="form-hint">Partial match if enabled</small>
        </div>
      `;
    } else if (field === "className") {
      html += `
        <div class="form-group">
          <label for="conditionClassName">Class Name</label>
          <input type="text" id="conditionClassName" class="form-input" value="${condition?.className || ''}" placeholder="e.g., Wizard">
        </div>
      `;
    }
  }
  
  html += '</div>';
  fieldsContainer.innerHTML = html;
}

function updateConditionType() {
  renderConditionFields(editingRule.draft.condition || {});
}

function buildConditionFromEditor() {
  const condType = document.getElementById("conditionType").value;
  const schema = CONDITION_SCHEMAS[condType];
  
  if (!schema) return null;
  
  if (schema.fields.length === 0) {
    return { type: condType };
  }
  
  const condition = { type: condType };
  
  for (const field of schema.fields) {
    if (field === "operator") {
      condition.operator = document.getElementById("conditionOperator").value;
    } else if (field === "value") {
      const val = document.getElementById("conditionValue").value;
      condition.value = isNaN(val) ? val : parseInt(val);
    } else if (field === "boolean") {
      condition.value = document.getElementById("conditionBoolean").checked;
    } else if (field === "itemName") {
      condition.itemName = document.getElementById("conditionItemName").value;
      condition.matchPartial = document.getElementById("conditionMatchPartial").checked;
    } else if (field === "className") {
      condition.className = document.getElementById("conditionClassName").value;
    }
  }
  
  return condition;
}

function renderConditionGroup(groupCondition) {
  const conditionBuilder = document.getElementById("conditionBuilder");
  let html = `
    <div class="condition-group">
      <div class="condition-group-header">
        <select class="condition-group-selector" id="groupOperator">
          <option value="AND" ${groupCondition.operator === 'AND' ? 'selected' : ''}>AND (all must match)</option>
          <option value="OR" ${groupCondition.operator === 'OR' ? 'selected' : ''}>OR (any can match)</option>
        </select>
      </div>
      <div id="groupConditions">
  `;
  
  if (groupCondition.conditions && groupCondition.conditions.length > 0) {
    groupCondition.conditions.forEach((cond, index) => {
      html += renderConditionGroupItem(cond, index);
    });
  }
  
  html += `
      </div>
      <div class="condition-controls">
        <button class="btn btn-secondary btn-small" onclick="addGroupCondition()">+ Add Condition</button>
        <button class="btn btn-secondary btn-small" onclick="convertToSingleCondition()">Convert to Single</button>
      </div>
    </div>
  `;
  
  conditionBuilder.innerHTML = html;
}

function renderConditionGroupItem(condition, index) {
  return `
    <div class="condition-item nested" data-condition-index="${index}">
      <div class="form-group">
        <label>Condition Type</label>
        <select class="form-select" onchange="updateGroupConditionType(${index})">
          <optgroup label="HP">
            <option value="hp_percentage" ${condition?.type === 'hp_percentage' ? 'selected' : ''}>HP Percentage</option>
            <option value="hp_value" ${condition?.type === 'hp_value' ? 'selected' : ''}>HP Value</option>
            <option value="hp_temp" ${condition?.type === 'hp_temp' ? 'selected' : ''}>Temporary HP</option>
            <option value="hp_missing" ${condition?.type === 'hp_missing' ? 'selected' : ''}>HP Missing</option>
          </optgroup>
          <optgroup label="Death">
            <option value="is_dead" ${condition?.type === 'is_dead' ? 'selected' : ''}>Is Dead</option>
            <option value="is_unconscious" ${condition?.type === 'is_unconscious' ? 'selected' : ''}>Is Unconscious</option>
            <option value="death_saves_success" ${condition?.type === 'death_saves_success' ? 'selected' : ''}>Death Save Successes</option>
            <option value="death_saves_failure" ${condition?.type === 'death_saves_failure' ? 'selected' : ''}>Death Save Failures</option>
          </optgroup>
        </select>
      </div>
      <div class="condition-controls">
        <button class="btn btn-danger btn-small" onclick="removeGroupCondition(${index})">Remove</button>
      </div>
    </div>
  `;
}

function addConditionToEditor() {
  if (!editingRule.draft.condition) {
    editingRule.draft.condition = { type: "always" };
  } else if (!editingRule.draft.condition.operator) {
    // Convert single condition to group
    const singleCondition = editingRule.draft.condition;
    editingRule.draft.condition = {
      operator: "AND",
      conditions: [singleCondition]
    };
  } else if (editingRule.draft.condition.operator === "AND" || editingRule.draft.condition.operator === "OR") {
    // Already a group, just add
    editingRule.draft.condition.conditions.push({ type: "always" });
  }
  
  renderConditionBuilder();
}

function addGroupCondition() {
  if (editingRule.draft.condition && editingRule.draft.condition.operator) {
    editingRule.draft.condition.conditions.push({ type: "always" });
    renderConditionBuilder();
  }
}

function removeGroupCondition(index) {
  if (editingRule.draft.condition && editingRule.draft.condition.conditions) {
    editingRule.draft.condition.conditions.splice(index, 1);
    renderConditionBuilder();
  }
}

function updateGroupConditionType(index) {
  // Update logic for group conditions
  renderConditionBuilder();
}

function convertToSingleCondition() {
  if (editingRule.draft.condition && editingRule.draft.condition.operator) {
    if (editingRule.draft.condition.conditions && editingRule.draft.condition.conditions.length > 0) {
      editingRule.draft.condition = editingRule.draft.condition.conditions[0];
    } else {
      editingRule.draft.condition = null;
    }
    renderConditionBuilder();
  }
}

// ============ ACTION BUILDER ============

function renderActionBuilder() {
  const actionBuilder = document.getElementById("actionBuilder");
  const actions = editingRule.draft.actions || [];
  
  let html = "";
  
  actions.forEach((action, index) => {
    html += renderActionItem(action, index);
  });
  
  actionBuilder.innerHTML = html;
}

function renderActionItem(action, index) {
  const schema = ACTION_SCHEMAS[action.type];
  
  let html = `<div class="action-item-editor" data-action-index="${index}">`;
  html += `
    <div class="form-group">
      <label for="actionType${index}">Action Type *</label>
      <select id="actionType${index}" class="form-select" onchange="updateActionType(${index})">
        <option value="">-- Select action type --</option>
  `;
  
  Object.entries(ACTION_SCHEMAS).forEach(([key, sch]) => {
    html += `<option value="${key}" ${action.type === key ? 'selected' : ''}>${sch.label}</option>`;
  });
  
  html += `</select></div>`;
  
  if (action.type && schema) {
    html += '<div class="action-type-fields">';
    
    for (const field of schema.fields) {
      if (field === "sourceName") {
        html += `
          <div class="form-group">
            <label for="actionSourceName${index}">Source Name *</label>
            <input type="text" id="actionSourceName${index}" class="form-input" value="${action.sourceName || ''}" placeholder="e.g., HP Bar">
          </div>
        `;
      } else if (field === "imagePath") {
        html += `
          <div class="form-group">
            <label for="actionImagePath${index}">Image Path *</label>
            <input type="text" id="actionImagePath${index}" class="form-input" value="${action.imagePath || ''}" placeholder="e.g., images/hp-50.png">
            <small class="form-hint">Path to image file (can be local or URL)</small>
          </div>
        `;
      } else if (field === "sceneName") {
        html += `
          <div class="form-group">
            <label for="actionSceneName${index}">Scene Name *</label>
            <input type="text" id="actionSceneName${index}" class="form-input" value="${action.sceneName || ''}" placeholder="e.g., Combat">
          </div>
        `;
      } else if (field === "itemName") {
        html += `
          <div class="form-group">
            <label for="actionItemName${index}">Item Name *</label>
            <input type="text" id="actionItemName${index}" class="form-input" value="${action.itemName || ''}" placeholder="e.g., Damage Indicator">
          </div>
        `;
      } else if (field === "visible") {
        html += `
          <div class="form-group">
            <label>Visible</label>
            <label class="toggle" style="margin-top: 8px;">
              <input type="checkbox" id="actionVisible${index}" ${action.visible ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
          </div>
        `;
      } else if (field === "text") {
        html += `
          <div class="form-group">
            <label for="actionText${index}">Text *</label>
            <textarea id="actionText${index}" class="form-textarea" placeholder="e.g., HP: {currentHp}/{maxHp}">${action.text || ''}</textarea>
            <small class="form-hint">Available variables: ${VARIABLE_HINTS.text}</small>
          </div>
        `;
      } else if (field === "filterName") {
        html += `
          <div class="form-group">
            <label for="actionFilterName${index}">Filter Name *</label>
            <input type="text" id="actionFilterName${index}" class="form-input" value="${action.filterName || ''}" placeholder="e.g., Red Tint">
          </div>
        `;
      }
    }
    
    html += '</div>';
  }
  
  html += `
    <div class="action-controls">
      <button class="btn btn-danger btn-small" onclick="removeActionFromEditor(${index})">Remove Action</button>
    </div>
  </div>
  `;
  
  return html;
}

function updateActionType(index) {
  renderActionBuilder();
}

function addActionToEditor() {
  editingRule.draft.actions = editingRule.draft.actions || [];
  editingRule.draft.actions.push({ type: "" });
  renderActionBuilder();
}

function removeActionFromEditor(index) {
  if (editingRule.draft.actions) {
    editingRule.draft.actions.splice(index, 1);
    renderActionBuilder();
  }
}

function buildActionsFromEditor() {
  const actions = [];
  const actionElements = document.querySelectorAll(".action-item-editor");
  
  actionElements.forEach((elem, index) => {
    const typeSelect = elem.querySelector(`[id="actionType${index}"]`);
    if (!typeSelect) return;
    
    const type = typeSelect.value;
    if (!type) return;
    
    const schema = ACTION_SCHEMAS[type];
    if (!schema) return;
    
    const action = { type };
    
    for (const field of schema.fields) {
      const elemId = `action${field.charAt(0).toUpperCase() + field.slice(1)}${index}`;
      const fieldElem = document.getElementById(elemId);
      
      if (!fieldElem) continue;
      
      if (field === "visible") {
        action[field] = fieldElem.checked;
      } else {
        action[field] = fieldElem.value;
      }
    }
    
    actions.push(action);
  });
  
  return actions;
}

// ============ ADVANCED JSON EDITOR ============

function openAdvancedJsonEditor() {
  const rule = editingRule.draft;
  delete rule._expanded;
  
  const json = JSON.stringify(rule, null, 2);
  document.getElementById("advancedJsonTextarea").value = json;
  document.getElementById("advancedJsonModal").classList.add("active");
}

function closeAdvancedJsonEditor() {
  document.getElementById("advancedJsonModal").classList.remove("active");
  clearAdvancedJsonEditor();
}

function clearAdvancedJsonEditor() {
  document.getElementById("advancedJsonTextarea").value = "";
}

function saveAdvancedJson() {
  try {
    const json = document.getElementById("advancedJsonTextarea").value;
    const parsed = JSON.parse(json);
    editingRule.draft = { ...parsed, _expanded: true };
    
    // Refresh editor to reflect changes
    renderConditionBuilder();
    renderActionBuilder();
    document.getElementById("ruleEditorName").value = editingRule.draft.name || "";
    document.getElementById("ruleEditorPriority").value = editingRule.draft.priority || 0;
    document.getElementById("ruleEditorEnabled").checked = editingRule.draft.enabled !== false;
    
    closeAdvancedJsonEditor();
    showToast("JSON imported successfully", "success");
  } catch (e) {
    showToast("Invalid JSON: " + e.message, "error");
  }
}

// ============ EVENT LISTENERS ============

// Setup event listeners
function setupEventListeners() {
  // Save button
  document.getElementById("saveBtn").addEventListener("click", saveRules);
  
  // Add rule list button
  document.getElementById("addRuleListBtn").addEventListener("click", addRuleList);
  
  // Import button
  document.getElementById("importBtn").addEventListener("click", () => {
    document.getElementById("importModal").classList.add("active");
    document.getElementById("importTextarea").value = "";
  });
  
  // Export button
  document.getElementById("exportBtn").addEventListener("click", () => {
    const exportConfig = JSON.parse(JSON.stringify(rulesConfig));
    // Remove _expanded flags
    exportConfig.ruleLists.forEach(list => {
      delete list._expanded;
      list.rules.forEach(rule => delete rule._expanded);
    });
    document.getElementById("exportTextarea").value = JSON.stringify(exportConfig, null, 2);
    document.getElementById("exportModal").classList.add("active");
  });
  
  // Modal close buttons
  document.getElementById("cancelImportBtn").addEventListener("click", () => {
    document.getElementById("importModal").classList.remove("active");
  });
  
  document.getElementById("closeExportBtn").addEventListener("click", () => {
    document.getElementById("exportModal").classList.remove("active");
  });
  
  // Import confirm
  document.getElementById("confirmImportBtn").addEventListener("click", () => {
    try {
      const imported = JSON.parse(document.getElementById("importTextarea").value);
      if (imported.ruleLists) {
        rulesConfig = imported;
        renderRules();
        document.getElementById("importModal").classList.remove("active");
        showToast("Rules imported successfully", "success");
      } else {
        showToast("Invalid rules format: missing ruleLists", "error");
      }
    } catch (e) {
      showToast("Invalid JSON: " + e.message, "error");
    }
  });
  
  // Copy export
  document.getElementById("copyExportBtn").addEventListener("click", () => {
    navigator.clipboard.writeText(document.getElementById("exportTextarea").value);
    showToast("Copied to clipboard", "success");
  });
  
  // Close modals on backdrop click
  document.querySelectorAll(".modal").forEach(modal => {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.classList.remove("active");
      }
    });
  });
}

// ============ UTILITIES ============

// Show toast notification
function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  
  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// Escape HTML
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

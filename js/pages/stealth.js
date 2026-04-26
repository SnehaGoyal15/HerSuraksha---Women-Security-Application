const expressionEl = document.getElementById("calculatorExpression");
const resultEl = document.getElementById("calculatorResult");
const displayBtn = document.getElementById("calculatorDisplay");
const buttons = document.querySelectorAll(".calc-btn");

let expression = "0";
let holdTimer = null;

function normalizeExpression(value) {
    return value
        .replace(/×/g, "*")
        .replace(/÷/g, "/")
        .replace(/−/g, "-");
}

function formatForDisplay(value) {
    return value
        .replace(/\*/g, "×")
        .replace(/\//g, "÷")
        .replace(/-/g, "−");
}

function canAppendOperator(char) {
    return /[+\-*/%]/.test(char);
}

function safeEvaluate(rawExpression) {
    const sanitized = normalizeExpression(rawExpression);
    if (!/^[0-9+\-*/%.()\s]+$/.test(sanitized)) {
        throw new Error("Invalid expression");
    }

    const result = Function(`"use strict"; return (${sanitized})`)();
    if (!Number.isFinite(result)) {
        throw new Error("Invalid result");
    }

    return result;
}

function renderExpression() {
    expressionEl.textContent = formatForDisplay(expression);

    try {
        if (/[+\-*/%]/.test(expression) && !/[+\-*/%]$/.test(expression)) {
            const preview = safeEvaluate(expression);
            resultEl.textContent = `= ${preview}`;
        } else {
            resultEl.innerHTML = "&nbsp;";
        }
    } catch (error) {
        resultEl.textContent = "";
    }
}

function appendValue(value) {
    const lastChar = expression.slice(-1);

    if (expression === "0" && /[0-9]/.test(value)) {
        expression = value;
        renderExpression();
        return;
    }

    if (value === ".") {
        const parts = expression.split(/[+\-*/%]/);
        const lastPart = parts[parts.length - 1];
        if (lastPart.includes(".")) return;
    }

    if (canAppendOperator(value)) {
        if (canAppendOperator(lastChar)) {
            expression = expression.slice(0, -1) + value;
        } else {
            expression += value;
        }
        renderExpression();
        return;
    }

    expression += value;
    renderExpression();
}

function clearExpression() {
    expression = "0";
    resultEl.innerHTML = "&nbsp;";
    renderExpression();
}

function backspaceExpression() {
    if (expression.length <= 1) {
        clearExpression();
        return;
    }

    expression = expression.slice(0, -1);
    renderExpression();
}

function evaluateExpression() {
    try {
        const result = safeEvaluate(expression);
        expression = String(result);
        resultEl.textContent = "= " + expression;
        renderExpression();
    } catch (error) {
        resultEl.textContent = "Error";
        setTimeout(() => {
            clearExpression();
        }, 800);
    }
}

buttons.forEach((button) => {
    button.addEventListener("click", () => {
        const value = button.dataset.value;
        const action = button.dataset.action;

        if (action === "clear") {
            clearExpression();
            return;
        }

        if (action === "backspace") {
            backspaceExpression();
            return;
        }

        if (action === "equals") {
            evaluateExpression();
            return;
        }

        if (value) {
            appendValue(value);
        }
    });
});

displayBtn.addEventListener("pointerdown", () => {
    holdTimer = setTimeout(() => {
        window.location.href = "dashboard.html";
    }, 1800);
});

["pointerup", "pointerleave", "pointercancel"].forEach((eventName) => {
    displayBtn.addEventListener(eventName, () => {
        if (holdTimer) {
            clearTimeout(holdTimer);
            holdTimer = null;
        }
    });
});

document.addEventListener("keydown", (event) => {
    const key = event.key;

    if (/^[0-9]$/.test(key) || ["+", "-", "*", "/", "%", "."].includes(key)) {
        appendValue(key);
        return;
    }

    if (key === "Enter" || key === "=") {
        evaluateExpression();
        return;
    }

    if (key === "Backspace") {
        backspaceExpression();
        return;
    }

    if (key === "Escape" || key.toLowerCase() === "c") {
        clearExpression();
    }
});

renderExpression();

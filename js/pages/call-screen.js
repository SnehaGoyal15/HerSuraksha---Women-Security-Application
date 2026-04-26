// Load fake call name from account settings
const fakeName=localStorage.getItem("fakeCallName") || "Mom"

document.getElementById("callerName").innerText=fakeName

let seconds=0

setInterval(function(){

seconds++

let min=Math.floor(seconds/60)
let sec=seconds%60

if(sec<10) sec="0"+sec

document.getElementById("timer").innerText=min+":"+sec

},1000)

// End call
document.getElementById("endBtn").onclick=function(){

window.location.href="dashboard.html"

}
import { applyTranslations } from "../utils/language.js";

applyTranslations();

document.addEventListener("DOMContentLoaded", function () {

["theory","fea","exp"].forEach(key => {

const input = document.getElementById("file-" + key)

if(!input) return

input.addEventListener("change", function(){

if(this.files.length > 0){

document.getElementById("name-" + key).textContent =
this.files[0].name

document.getElementById("drop-" + key)
.classList.add("has-file")

}

checkFilesReady()

})

})

})

function checkFilesReady(){

const ready = ["theory","fea","exp"].every(k => {

const el = document.getElementById("file-" + k)

return el && el.files.length > 0

})

document.getElementById("train-btn").disabled = !ready

}

async function trainModels(){

const btn = document.getElementById("train-btn")

btn.disabled = true
btn.textContent = "Training..."

const fd = new FormData()

fd.append("theory",
document.getElementById("file-theory").files[0])

fd.append("fea",
document.getElementById("file-fea").files[0])

fd.append("exp",
document.getElementById("file-exp").files[0])

const res = await fetch("/train",{
method:"POST",
body:fd
})

const data = await res.json()

btn.textContent = "Training Done"

alert("Training completed")

}

async function runInverse(){

const btn = document.getElementById("inv-run-btn")

btn.disabled = true
btn.textContent = "Running..."

const payload = {

density:parseFloat(
document.getElementById("inv-density").value
),

stress:parseFloat(
document.getElementById("inv-stress").value
),

energy:parseFloat(
document.getElementById("inv-energy").value
),

strain:parseFloat(
document.getElementById("inv-strain").value
)

}

const res = await fetch("/inverse",{

method:"POST",
headers:{
"Content-Type":"application/json"
},

body:JSON.stringify(payload)

})

const data = await res.json()

document.getElementById("inv-output")
.textContent = JSON.stringify(data,null,2)

btn.disabled = false
btn.textContent = "Run Inverse"

}

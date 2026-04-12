import { initializeApp } from "firebase/app";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut
} from "firebase/auth";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  arrayUnion,
  collection,
  addDoc,
  getDocs
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBphqiFUGzH6_cGsC5WjOnzLl5mfzpGiPI",
  authDomain: "capstone-9d351.firebaseapp.com",
  databaseURL: "https://capstone-9d351-default-rtdb.firebaseio.com",
  projectId: "capstone-9d351",
  storageBucket: "capstone-9d351.firebasestorage.app",
  messagingSenderId: "470718252265",
  appId: "1:470718252265:web:cd94d47670c95b936b5c78",
  measurementId: "G-S5JMX65HZM"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);






// AUTENTICACIÓN


async function registrarUsuario(cuenta, contrasena, datosUsuario) {
  try {
    const credencial = await createUserWithEmailAndPassword(auth, cuenta, contrasena);
    const uid = credencial.user.uid;

    await setDoc(doc(db, "usuarios", uid), {
      cuenta: cuenta,
      nombre: datosUsuario.nombre,
      apellido: datosUsuario.apellido,
      edad: datosUsuario.edad,
      background: datosUsuario.background,
      intereses: datosUsuario.intereses,
      IDs_cursos: datosUsuario.IDs_cursos ?? []
    });

    console.log("Usuario registrado con UID:", uid);
    return uid;
  } catch (error) {
    console.error("Error al registrar:", error.message);
    throw error;
  }
}

async function iniciarSesion(cuenta, contrasena) {
  try {
    const credencial = await signInWithEmailAndPassword(auth, cuenta, contrasena);
    console.log("Sesión iniciada:", credencial.user.uid);
    return credencial.user;
  } catch (error) {
    console.error("Error al iniciar sesión:", error.message);
    throw error;
  }
}

async function cerrarSesion() {
  await signOut(auth);
  console.log("Sesión cerrada.");
}



// USUARIOS — CRUD


async function obtenerUsuario(uid) {
  const ref = doc(db, "usuarios", uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    return snap.data();
  } else {
    console.warn("Usuario no encontrado:", uid);
    return null;
  }
}

async function actualizarUsuario(uid, campos) {
  const ref = doc(db, "usuarios", uid);
  await updateDoc(ref, campos);
  console.log("Usuario actualizado:", uid);
}

async function agregarCursoAUsuario(uid, idCurso) {
  const ref = doc(db, "usuarios", uid);
  await updateDoc(ref, {
    IDs_cursos: arrayUnion(idCurso)
  });
  console.log(`Curso ${idCurso} añadido al usuario ${uid}`);
}



// CURSOS — CRUD


async function crearCurso(datosCurso) {
  try {
    const ref = await addDoc(collection(db, "cursos"), {
      ID_curso: datosCurso.ID_curso,
      ruta_cronograma: datosCurso.ruta_cronograma,
      ruta_avances: datosCurso.ruta_avances,
      ruta_conversaciones: datosCurso.ruta_conversaciones,
      ruta_evaluaciones: datosCurso.ruta_evaluaciones
    });
    console.log("Curso creado con ID:", ref.id);
    return ref.id;
  } catch (error) {
    console.error("Error al crear curso:", error.message);
    throw error;
  }
}

async function obtenerTodosCursos() {
  const snap = await getDocs(collection(db, "cursos"));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function obtenerCurso(docId) {
  const ref = doc(db, "cursos", docId);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    return { id: snap.id, ...snap.data() };
  } else {
    console.warn("Curso no encontrado:", docId);
    return null;
  }
}



// EXPORTACIONES

export {
  auth,
  db,
  registrarUsuario,
  iniciarSesion,
  cerrarSesion,
  obtenerUsuario,
  actualizarUsuario,
  agregarCursoAUsuario,
  crearCurso,
  obtenerTodosCursos,
  obtenerCurso
};
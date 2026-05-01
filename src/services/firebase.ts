import { initializeApp } from "firebase/app";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import type { User } from "firebase/auth";
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

// ===== AUTENTICACIÓN =====

export async function registrarUsuario(
  cuenta: string,
  contrasena: string,
  datosUsuario: {
    nombre: string;
    apellido: string;
    edad: string;
    intereses: string[];
    idsCursos: number[];
  }
) {
  try {
    console.log("Registrando usuario con email:", cuenta);
    
    // Crear usuario en Firebase Auth
    const credencial = await createUserWithEmailAndPassword(auth, cuenta, contrasena);
    const uid = credencial.user.uid;
    console.log("Usuario creado en Auth con UID:", uid);

    // Guardar datos en Firestore
    await setDoc(doc(db, "usuarios", uid), {
      cuenta,
      nombre: datosUsuario.nombre,
      apellido: datosUsuario.apellido,
      edad: datosUsuario.edad,
      intereses: datosUsuario.intereses,
      idsCursos: datosUsuario.idsCursos,
      createdAt: new Date(),
    });

    console.log("Usuario guardado en Firestore con datos:", {
      cuenta,
      nombres: datosUsuario.nombre,
      apellidos: datosUsuario.apellido,
    });
    
    return uid;
  } catch (error: any) {
    console.error("Error al registrar:", error.message);
    throw error;
  }
}

export async function iniciarSesion(cuenta: string, contrasena: string) {
  try {
    const credencial = await signInWithEmailAndPassword(auth, cuenta, contrasena);
    console.log("Sesión iniciada:", credencial.user.uid);
    return credencial.user;
  } catch (error: any) {
    console.error("Error al iniciar sesión:", error.message);
    throw error;
  }
}

export async function cerrarSesion() {
  await signOut(auth);
  console.log("Sesión cerrada.");
}

export function escucharAutenticacion(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}

// ===== USUARIOS — CRUD =====

export async function obtenerUsuario(uid: string) {
  try {
    const ref = doc(db, "usuarios", uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      return snap.data();
    } else {
      console.warn("Usuario no encontrado:", uid);
      return null;
    }
  } catch (error: any) {
    console.error("Error al obtener usuario:", error.message);
    throw error;
  }
}

export async function actualizarUsuario(uid: string, campos: any) {
  try {
    const ref = doc(db, "usuarios", uid);
    await updateDoc(ref, campos);
    console.log("Usuario actualizado:", uid);
  } catch (error: any) {
    console.error("Error al actualizar usuario:", error.message);
    throw error;
  }
}

export async function agregarCursoAUsuario(uid: string, idCurso: number) {
  try {
    const ref = doc(db, "usuarios", uid);
    await updateDoc(ref, {
      IDs_cursos: arrayUnion(idCurso)
    });
    console.log(`Curso ${idCurso} añadido al usuario ${uid}`);
  } catch (error: any) {
    console.error("Error al agregar curso:", error.message);
    throw error;
  }
}

// ===== CURSOS — CRUD =====

export async function obtenerTodosCursos() {
  try {
    const snap = await getDocs(collection(db, "cursos"));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error: any) {
    console.error("Error al obtener cursos:", error.message);
    throw error;
  }
}

export async function crearCurso(datosCurso: {
  ID_curso: number;
  Ruta_cronograma: string;
  Ruta_avances: string;
  Ruta_conversaciones: string;
  Ruta_evaluaciones: string;
}) {
  try {
    const ref = await addDoc(collection(db, "cursos"), datosCurso);
    console.log("Curso creado con ID:", ref.id);
    return ref.id;
  } catch (error: any) {
    console.error("Error al crear curso:", error.message);
    throw error;
  }
}

export { auth, db };
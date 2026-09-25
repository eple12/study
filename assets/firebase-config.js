// Firebase 동기화 설정.
// Firebase 콘솔 → 프로젝트 설정 → 내 앱(웹 앱) 의 firebaseConfig 값을 아래처럼 붙여 넣으면 동기화가 켜진다.
// 비워 두면(null) 동기화 없이 지금처럼 이 기기에만 저장된다.
// 이 값들은 비밀이 아니다(공개 저장소에 올려도 됨). 접근은 firestore.rules 가 막는다.
//
// export const firebaseConfig = {
//   apiKey: '...',
//   authDomain: '프로젝트ID.firebaseapp.com',
//   projectId: '프로젝트ID',
//   appId: '...',
// };
export const firebaseConfig = {
  apiKey: "AIzaSyBMXPsAmEfjS0pdn99c8WFJzWwZ1q1tK2k",
  authDomain: "study-d349f.firebaseapp.com",
  projectId: "study-d349f",
  storageBucket: "study-d349f.firebasestorage.app",
  messagingSenderId: "741863325810",
  appId: "1:741863325810:web:d4772fae0844ee78e5c2eb",
  measurementId: "G-F6E29WZ8M3"
};

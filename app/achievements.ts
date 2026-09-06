import type { Library } from "./saves";

export type Achievement = { id: string; title: string; description: string; isUnlocked: (library: Library) => boolean };

const hasRoute = (library: Library, route: string) => library.visited.some(id => id.startsWith(`wide_${route}_`));

export const achievements: Achievement[] = [
  { id: "first_choice", title: "Первый ход", description: "Сделать первый выбор в истории.", isUnlocked: library => library.decisions.length >= 1 },
  { id: "route_reader", title: "Не по рельсам", description: "Посетить 50 различных сцен.", isUnlocked: library => library.visited.length >= 50 },
  { id: "route_cartographer", title: "Картограф", description: "Посетить 150 различных сцен.", isUnlocked: library => library.visited.length >= 150 },
  { id: "four_roads", title: "Четыре дороги", description: "Пройти все четыре маршрута ночной главы в разных играх.", isUnlocked: library => ["home", "ivan", "dima", "archive"].every(route => hasRoute(library, route)) },
  { id: "long_way", title: "Длинный путь", description: "Дойти до третьей развилки одного ночного маршрута.", isUnlocked: library => library.visited.some(id => /wide_.+_choice_3/.test(id)) },
  { id: "collector", title: "Коллекционер финалов", description: "Открыть три разные концовки.", isUnlocked: library => library.unlocked.length >= 3 },
  { id: "all_routes", title: "Ни одной версии", description: "Открыть все концовки.", isUnlocked: library => library.unlocked.length >= 6 },
];

export const unlockedAchievements = (library: Library) => achievements.filter(achievement => achievement.isUnlocked(library));

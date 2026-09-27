# -*- coding: utf-8 -*-
"""
EditorJogo -> Unreal Engine 5
Importa as malhas (GLB) e coloca na fase todos os objetos, NPCs (Target Points) e zonas
exportados pelo EditorJogo.

COMO USAR
1. No UE5: Edit > Plugins > ative "Python Editor Script Plugin" (e reinicie o editor).
2. Importe o heightmap pelo modo Landscape (veja LEIA-ME_UE5.txt).
3. Tools > Execute Python Script... (ou File > Execute Python Script) e escolha ESTE arquivo.
   Ele precisa estar na mesma pasta do cena.json e da pasta meshes/.

Pode rodar de novo quantas vezes quiser: os atores da pasta "EditorJogo" do Outliner
são apagados e recriados.
"""
import json
import os

import unreal

PASTA = os.path.dirname(os.path.abspath(__file__))
DESTINO = "/Game/EditorJogo"

# Se as peças aparecerem giradas 90 graus em relação ao terreno, troque para 90 ou -90.
ROT_YAW_EXTRA = 0.0
# Centraliza o Landscape importado na origem (0, 0, 0), igual ao editor.
ALINHAR_LANDSCAPE = True
# Cria Target Points onde estão os NPCs (só para referência visual no UE).
CRIAR_NPCS = True
# Marca os vértices das zonas com Target Points (pasta EditorJogo/Zonas).
MARCAR_ZONAS = True


def log(msg):
    unreal.log("[EditorJogo] " + str(msg))


def ler_cena():
    with open(os.path.join(PASTA, "cena.json"), "r", encoding="utf-8") as f:
        return json.load(f)


def importar_malha(arquivo, nome):
    caminho = os.path.join(PASTA, arquivo)
    if not os.path.exists(caminho):
        log("Arquivo não encontrado: " + caminho)
        return None
    destino = DESTINO + "/Meshes/" + nome
    task = unreal.AssetImportTask()
    task.filename = caminho
    task.destination_path = destino
    task.automated = True
    task.replace_existing = True
    task.save = True
    unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
    candidatos = list(task.imported_object_paths or [])
    if not candidatos:
        candidatos = unreal.EditorAssetLibrary.list_assets(destino, recursive=True)
    for p in candidatos:
        a = unreal.load_asset(p)
        if isinstance(a, unreal.StaticMesh):
            return a
    log("Nenhuma StaticMesh importada de " + arquivo)
    return None


def limpar_anteriores(sub):
    for a in sub.get_all_level_actors():
        pasta = str(a.get_folder_path())
        if pasta.startswith("EditorJogo"):
            sub.destroy_actor(a)


def alinhar_landscape(sub):
    for a in sub.get_all_level_actors():
        if isinstance(a, unreal.LandscapeProxy):
            origem, extensao = a.get_actor_bounds(False)
            loc = a.get_actor_location()
            nova = unreal.Vector(loc.x - origem.x, loc.y - origem.y, 0.0)
            a.set_actor_location(nova, False, False)
            log("Landscape centralizado em (0, 0, 0): " + a.get_actor_label())
            return True
    log("Nenhum Landscape encontrado (importe o heightmap antes, se quiser alinhar).")
    return False


def rotator(r):
    # r = [pitch, yaw, roll]
    return unreal.Rotator(roll=float(r[2]), pitch=float(r[0]), yaw=float(r[1]) + ROT_YAW_EXTRA)


def escala(s):
    if abs(abs(ROT_YAW_EXTRA) - 90.0) < 0.01:
        return unreal.Vector(float(s[1]), float(s[0]), float(s[2]))
    return unreal.Vector(float(s[0]), float(s[1]), float(s[2]))


def main():
    cena = ler_cena()
    sub = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    limpar_anteriores(sub)
    if ALINHAR_LANDSCAPE:
        alinhar_landscape(sub)

    malhas = {}
    with unreal.ScopedSlowTask(len(cena.get("malhas", {})), "Importando malhas do EditorJogo...") as tarefa:
        tarefa.make_dialog(True)
        for nome, arquivo in cena.get("malhas", {}).items():
            if tarefa.should_cancel():
                return
            tarefa.enter_progress_frame(1, "Importando " + nome)
            malhas[nome] = importar_malha(arquivo, nome)

    objetos = cena.get("objetos", [])
    with unreal.ScopedSlowTask(len(objetos), "Colocando objetos...") as tarefa:
        tarefa.make_dialog(True)
        for o in objetos:
            if tarefa.should_cancel():
                break
            tarefa.enter_progress_frame(1)
            asset = malhas.get(o["malha"])
            if asset is None:
                continue
            loc = unreal.Vector(*[float(v) for v in o["local"]])
            ator = sub.spawn_actor_from_object(asset, loc, rotator(o["rot"]))
            if ator:
                ator.set_actor_scale3d(escala(o["escala"]))
                ator.set_actor_label(o.get("nome", o["malha"]))
                ator.set_folder_path("EditorJogo/Objetos")

    if CRIAR_NPCS:
        for n in cena.get("npcs", []):
            loc = unreal.Vector(*[float(v) for v in n["local"]])
            ator = sub.spawn_actor_from_class(unreal.TargetPoint, loc, unreal.Rotator(0.0, 0.0, float(n["yaw"])))
            if ator:
                ator.set_actor_label("NPC_%s_%s" % (n["npcId"], n["nome"]))
                ator.set_folder_path("EditorJogo/NPCs")
                ator.tags = [unreal.Name("npc"), unreal.Name(str(n["npcId"])), unreal.Name(n.get("tipo", ""))]

    if MARCAR_ZONAS:
        for z in cena.get("zonas", []):
            for i, pt in enumerate(z["pontos"]):
                ator = sub.spawn_actor_from_class(unreal.TargetPoint, unreal.Vector(float(pt[0]), float(pt[1]), float(pt[2])), unreal.Rotator(0.0, 0.0, 0.0))
                if ator:
                    ator.set_actor_label("Zona_%s_%s_%d" % (z["tipo"], z["nome"], i + 1))
                    ator.set_folder_path("EditorJogo/Zonas/" + z["nome"])

    log("Pronto! %d objetos, %d NPCs, %d zonas." % (len(objetos), len(cena.get("npcs", [])), len(cena.get("zonas", []))))


main()

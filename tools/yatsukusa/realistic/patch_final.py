from __future__ import annotations

import re
import sys
from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, got {count}")
    return text.replace(old, new, 1)


def replace_regex(text: str, pattern: str, replacement: str, label: str) -> str:
    out, count = re.subn(pattern, replacement, text, count=1, flags=re.MULTILINE | re.DOTALL)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, got {count}")
    return out


def main(path: str) -> None:
    target = Path(path)
    text = target.read_text(encoding="utf-8")

    text = replace_once(
        text,
        "scene.view_settings.exposure = -0.42",
        "scene.view_settings.exposure = 0.45",
        "final photographic exposure",
    )
    text = replace_once(
        text,
        "scene.view_settings.look = 'AgX - Medium High Contrast'",
        "scene.view_settings.look = 'AgX - Medium Low Contrast'",
        "final AgX contrast",
    )
    text = replace_once(
        text,
        "scene.view_settings.look = 'Medium High Contrast'",
        "scene.view_settings.look = 'Medium Low Contrast'",
        "fallback contrast",
    )

    text = replace_once(
        text,
        "simple_house('EastMediterranean',108,48,11,9,6.5,MAT['stucco_beige'],MAT['roof_red'],arched=True)",
        """MAT['stucco_beige'] = solid_material('MAT_StuccoBeigeEarly', (.52,.40,.27), roughness=.91, noise_scale=7, noise_strength=.11, bump_strength=.12)
simple_house('EastMediterranean',108,48,11,9,6.5,MAT['stucco_beige'],MAT['roof_red'],arched=True)""",
        "early surrounding-building material",
    )

    text = replace_once(
        text,
        "    'bronze': image_material('MAT_DarkBronzeActual', 'bronze_base.png', height_file='bronze_height.png', roughness=.48, bump_strength=.34, mapping_scale=(1.55,1.55,1.55), use_uv=False, metallic=.58),",
        "    'bronze': solid_material('MAT_DarkBronzeFinal', (.115,.072,.038), roughness=.52, metallic=.52, noise_scale=7.5, noise_strength=.32, bump_strength=.26),",
        "non-stretched bronze material",
    )

    text = replace_once(
        text,
        "MAT['hedge'] = image_material('MAT_ClippedHedgeActual', 'hedge_base.png', height_file='hedge_height.png', roughness=.94, bump_strength=.43, mapping_scale=(1.55,1.55,1.55), use_uv=False)\nMAT['hedge_light'] = image_material('MAT_ClippedHedgeLightActual', 'hedge_light_base.png', height_file='hedge_height.png', roughness=.94, bump_strength=.38, mapping_scale=(1.45,1.45,1.45), use_uv=False)",
        "MAT['hedge'] = solid_material('MAT_ClippedHedgeFinal', (.040,.145,.032), roughness=.96, noise_scale=10, noise_strength=.30, bump_strength=.30)\nMAT['hedge_light'] = solid_material('MAT_ClippedHedgeLightFinal', (.062,.190,.040), roughness=.96, noise_scale=11, noise_strength=.28, bump_strength=.27)",
        "non-stretched hedge materials",
    )

    text = replace_once(
        text,
        "MAT['face_recess'] = solid_material('MAT_FaceRecess', (.15,.145,.135), roughness=.87, noise_scale=6, noise_strength=.14, bump_strength=.12)",
        """MAT['face_recess'] = solid_material('MAT_FaceRecess', (.105,.100,.092), roughness=.91, noise_scale=6, noise_strength=.18, bump_strength=.15)
MAT['canopy_inner'] = solid_material('MAT_CanopyInterior', (.034,.108,.026), roughness=.99, noise_scale=5.5, noise_strength=.20, bump_strength=.10)
MAT['paver_grime'] = solid_material('MAT_PaverEdgeGrime', (.075,.072,.064), roughness=.99, noise_scale=3.2, noise_strength=.32, bump_strength=.18)""",
        "final vegetation and grime materials",
    )

    vegetation = r'''def make_tree(name: str, x: float, y: float, height: float, crown: float, seed: int, collection: str='VEGETATION', leaf_density: float=1.0):
    rng=random.Random(seed)
    verts=[];faces=[];uvs=[]
    lean=Vector((rng.uniform(-.8,.8),rng.uniform(-.8,.8),0))
    fork=height*rng.uniform(.34,.44)
    trunk_pts=[Vector((x,y,0.02)),Vector((x+lean.x*.22,y+lean.y*.22,height*.24)),Vector((x+lean.x*.52,y+lean.y*.52,fork))]
    append_tapered_segment(verts,faces,uvs,trunk_pts[0],trunk_pts[1],height*.055,height*.045,14,v_scale=2.8)
    append_tapered_segment(verts,faces,uvs,trunk_pts[1],trunk_pts[2],height*.046,height*.030,14,v_start=height*.24/2.8,v_scale=2.8)
    for ri in range(7):
        a=2*math.pi*ri/7+rng.uniform(-.20,.20)
        start=Vector((x+math.cos(a)*height*.025,y+math.sin(a)*height*.025,.09))
        end=Vector((x+math.cos(a)*height*.145,y+math.sin(a)*height*.145,.018))
        append_tapered_segment(verts,faces,uvs,start,end,height*.030,.0065,9,v_scale=2)
    tips=[]
    branch_count=10+rng.randrange(4)
    for bi in range(branch_count):
        angle=2*math.pi*bi/branch_count+rng.uniform(-.30,.30)
        start_z=height*rng.uniform(.31,.49)
        start=Vector((x+lean.x*(start_z/height),y+lean.y*(start_z/height),start_z))
        length=crown*rng.uniform(.72,1.13)
        end=Vector((start.x+math.cos(angle)*length,start.y+math.sin(angle)*length,height*rng.uniform(.68,.96)))
        mid=start.lerp(end,.52)+Vector((rng.uniform(-.32,.32),rng.uniform(-.32,.32),height*rng.uniform(.04,.11)))
        append_tapered_segment(verts,faces,uvs,start,mid,height*.032,height*.018,11,v_scale=2.5)
        append_tapered_segment(verts,faces,uvs,mid,end,height*.019,height*.006,10,v_start=(mid-start).length/2.5,v_scale=2.5)
        tips.append(end)
        for _ in range(4):
            sa=angle+rng.uniform(-.80,.80)
            sstart=mid.lerp(end,rng.uniform(.16,.76))
            send=sstart+Vector((math.cos(sa)*crown*rng.uniform(.28,.58),math.sin(sa)*crown*rng.uniform(.28,.58),height*rng.uniform(.06,.20)))
            append_tapered_segment(verts,faces,uvs,sstart,send,height*.012,height*.0035,8,v_scale=2)
            tips.append(send)
    trunk=mesh_object(name+'_Wood',verts,faces,MAT['bark'],collection,uvs=uvs)
    for poly in trunk.data.polygons:
        poly.use_smooth=True

    # Dense irregular inner volumes create the continuous dark crown visible in
    # the source video. Fine alpha cards are restricted to the outer silhouette.
    centre=Vector((x+lean.x*.62,y+lean.y*.62,height*.76))
    lobe_count=9+rng.randrange(4)
    for li in range(lobe_count):
        a=2*math.pi*li/lobe_count+rng.uniform(-.36,.36)
        radial=crown*rng.uniform(.16,.48)
        p=centre+Vector((math.cos(a)*radial,math.sin(a)*radial,height*rng.uniform(-.10,.11)))
        sx=crown*rng.uniform(.40,.60)
        sy=crown*rng.uniform(.38,.57)
        sz=crown*rng.uniform(.34,.50)
        lobe=ico_sphere(f'{name}_CanopyInner_{li}',tuple(p),(sx,sy,sz),MAT['canopy_inner'],collection,subdivisions=3)
        for vertex in lobe.data.vertices:
            co=vertex.co
            co*=1.0+rng.uniform(-.11,.11)+.035*math.sin(co.x*3.1+co.y*2.3+co.z*4.2)
        for poly in lobe.data.polygons:
            poly.use_smooth=True

    lv=[];lf=[];luv=[]
    cluster_count=max(72,int((82+rng.randrange(22))*leaf_density))
    positions=tips[:]
    while len(positions)<cluster_count:
        a=rng.uniform(0,2*math.pi)
        rad=crown*math.sqrt(rng.random())*.98
        positions.append(Vector((centre.x+math.cos(a)*rad,centre.y+math.sin(a)*rad,height*rng.uniform(.57,1.01))))
    for p in positions[:cluster_count]:
        w=crown*rng.uniform(.18,.31);h=w*rng.uniform(.70,1.08)
        rot=rng.uniform(0,math.pi)
        for cross in range(3):
            ang=rot+cross*math.pi/3
            right=Vector((math.cos(ang),math.sin(ang),0))*w*.5
            up=Vector((0,0,h*.5))
            base=len(lv)
            lv.extend([tuple(p-right-up),tuple(p+right-up),tuple(p+right+up),tuple(p-right+up)])
            lf.append((base,base+1,base+2,base+3));luv.append([(0,0),(1,0),(1,1),(0,1)])
    leaves=mesh_object(name+'_Leaves',lv,lf,MAT[['leaf_a','leaf_b','leaf_c'][seed%3]],collection,uvs=luv)
    return trunk,leaves


def make_hedge(name: str, points: Sequence[Sequence[float]], width: float=1.45, height: float=1.25, material=None):
    material=material or MAT['hedge']
    pts=catmull_rom(points,7,False)
    verts=[];faces=[];uvs=[]
    ring=10
    for i,p in enumerate(pts):
        prev=pts[max(0,i-1)];nxt=pts[min(len(pts)-1,i+1)]
        tangent=(nxt-prev).normalized()
        normal=Vector((-tangent.y,tangent.x,0))
        local_width=width*(.93+.09*math.sin(i*1.71+len(name)))
        local_height=height*(.94+.07*math.sin(i*1.19+len(name)*.3))
        for j in range(ring):
            theta=2*math.pi*j/ring
            side=math.cos(theta)*local_width*.52
            # Rounded clipped section: broad upper shoulder, narrower base.
            z=local_height*.53+math.sin(theta)*local_height*.50
            if z < local_height*.18:
                side*=.82
            q=Vector((p.x,p.y,max(.03,z)))+normal*side
            verts.append(tuple(q))
        if i:
            base=(i-1)*ring
            for j in range(ring):
                k=(j+1)%ring
                faces.append((base+j,base+k,base+ring+k,base+ring+j))
                uvs.append([(j/ring,(i-1)/8),(k/ring,(i-1)/8),(k/ring,i/8),(j/ring,i/8)])
    faces.append(tuple(range(ring-1,-1,-1)));uvs.append([(j/ring,0) for j in range(ring-1,-1,-1)])
    last=(len(pts)-1)*ring
    faces.append(tuple(last+j for j in range(ring)));uvs.append([(j/ring,len(pts)/8) for j in range(ring)])
    hedge=mesh_object(name+'_Continuous',verts,faces,material,'VEGETATION',uvs=uvs)
    add_bevel(hedge,.12,2)
    for poly in hedge.data.polygons:
        poly.use_smooth=True
    return hedge


def make_bush(name: str, x: float, y: float, radius: float, seed: int, light: bool=False):
    rng=random.Random(seed)
    material=MAT['hedge_light' if light else 'hedge']
    obj=ico_sphere(name,(x,y,radius*.62),(radius*rng.uniform(.92,1.12),radius*rng.uniform(.86,1.08),radius*rng.uniform(.68,.86)),material,'VEGETATION',subdivisions=3)
    for vertex in obj.data.vertices:
        co=vertex.co
        co*=1+rng.uniform(-.075,.075)+.025*math.sin(co.x*5+co.y*4+co.z*6)
    for poly in obj.data.polygons:
        poly.use_smooth=True
    return obj


# Hedges defining'''
    text = replace_regex(
        text,
        r"^def make_tree\(.*?^# Hedges defining",
        vegetation,
        "continuous vegetation",
    )

    bronze = r'''def bronze_drooping_sculpture(x=78.5,y=49.0):
    cube('BronzeDroop_Pedestal',(x,y,1.25),(1.72,1.72,2.5),MAT['paint_black'],'SCULPTURES',bevel=.035)
    # Frame 00028 shows a broad arched top, a rectangular negative opening,
    # one thick left support and a narrow down-curving tip on the right.
    cube('BronzeDroop_Top',(x,y,4.35),(.72,2.34,.82),MAT['bronze'],'SCULPTURES',bevel=.34)
    cube('BronzeDroop_LeftMass',(x,y+.78,3.92),(.70,.70,1.20),MAT['bronze'],'SCULPTURES',bevel=.26)
    cube('BronzeDroop_InnerShoulder',(x,y-.12,4.00),(.69,.38,.54),MAT['bronze'],'SCULPTURES',bevel=.16)
    variable_tube('BronzeDroop_Tip',[
        (x,y-.82,4.25),(x,y-1.08,4.08),(x,y-1.17,3.77),(x,y-1.09,3.48)
    ],[.31,.28,.21,.13],MAT['bronze'],'SCULPTURES',elliptical=.62,sides=28)
    # Dark inset reads as a true opening from the route without fragile booleans.
    cube('BronzeDroop_Opening',(x-.366,y+.10,3.91),(.025,.78,.55),MAT['paint_black'],'SCULPTURES',bevel=.11)
    plaque('BronzeDroop_Plaque',x-.88,y,1.28,rot_z=math.radians(90))
bronze_drooping_sculpture()'''
    text = replace_regex(
        text,
        r"^def bronze_drooping_sculpture\(.*?^bronze_drooping_sculpture\(\)",
        bronze,
        "final bronze silhouette",
    )

    black = r'''def black_sphere_sculpture(x=78.0,y=4.0):
    cube('BlackSphere_Base',(x,y,.42),(2.15,5.25,.84),MAT['dark_concrete'],'SCULPTURES',bevel=.07)
    # Broadside axis follows Y; the road-facing camera looks east and therefore
    # sees the long horizontal animal/bench silhouette instead of its end.
    cube('BlackSphere_Tail',(x,y+1.72,2.30),(1.24,1.05,2.55),MAT['paint_black'],'SCULPTURES',bevel=.34)
    cube('BlackSphere_Body',(x,y+.02,1.86),(1.24,3.75,1.10),MAT['paint_black'],'SCULPTURES',bevel=.40)
    cube('BlackSphere_RightSupport',(x,y-1.45,1.28),(1.14,.78,1.55),MAT['paint_black'],'SCULPTURES',bevel=.26)
    sphere('BlackSphere_Orb',(x,y-.92,3.03),(.62,.62,.62),MAT['paint_black'],'SCULPTURES',segments=40,rings=20)
    cube('BlackSphere_Undercut',(x-.64,y-.10,1.54),(.04,1.65,.38),MAT['paver_grime'],'SCULPTURES',bevel=.08)
    plaque('BlackSphere_Plaque',x-.98,y-.55,.60,rot_z=math.radians(90))
black_sphere_sculpture()'''
    text = replace_regex(
        text,
        r"^def black_sphere_sculpture\(.*?^black_sphere_sculpture\(\)",
        black,
        "final black sphere silhouette",
    )

    stone = r'''def stone_face_sculpture(x=69.0,y=-23.0):
    cube('StoneFace_Base',(x,y,.44),(3.80,2.42,.88),MAT['dark_concrete'],'SCULPTURES',bevel=.13)
    # Frames 00172–00173 show a thick rounded rectangular boulder, not a disc.
    cube('StoneFace_Head',(x,y,2.32),(2.62,1.36,2.86),MAT['stone_sculpture'],'SCULPTURES',bevel=.52)
    # One tall rounded recess dominates the front; there are no eye/mouth marks.
    cube('StoneFace_Recess',(x,y-.692,2.34),(.92,.035,1.38),MAT['face_recess'],'SCULPTURES',bevel=.28)
    cube('StoneFace_RecessBack',(x,y-.716,2.34),(.58,.018,.98),MAT['stone_sculpture'],'SCULPTURES',bevel=.20)
    plaque('StoneFace_Plaque',x,y-1.30,.56)
stone_face_sculpture()'''
    text = replace_regex(
        text,
        r"^def stone_face_sculpture\(.*?^stone_face_sculpture\(\)",
        stone,
        "final stone face silhouette",
    )

    text = replace_once(
        text,
        "('Hedge_BlackSphere',[(84,7),(79,5),(74,4)],1.45,1.25),",
        "('Hedge_BlackSphere',[(84,7),(82,6),(80.5,5.5)],1.45,1.25),",
        "black-sphere foreground clearance",
    )

    text = replace_once(
        text,
        "cube('NW_RedAnnexRoof',(-79.0,43,3.42),(6.9,6.4,.22),MAT['roof_red'],'BUILDINGS',bevel=.05)",
        """cube('NW_RedAnnexRoof',(-79.0,43,3.42),(6.9,6.4,.22),MAT['roof_red'],'BUILDINGS',bevel=.05)
# Blue exterior stair and landing visible in the 04:32-04:40 sequence.
for i in range(9):
    cube(f'NW_BlueStair_{i}',(-74.9,40.0+i*.34,.20+i*.18),(1.65,.34,.14),MAT['blue'],'BUILDINGS',bevel=.025)
for side in (-.72,.72):
    bar_between(f'NW_StairRail_{side}',(-74.9+side,39.9,.58),(-74.9+side,43.0,2.30),.045,MAT['blue'],'BUILDINGS',8)
cube('NW_BlueLanding',(-74.9,43.1,2.18),(1.75,1.05,.16),MAT['blue'],'BUILDINGS',bevel=.025)""",
        "northwest stair detail",
    )

    text = replace_once(
        text,
        "bg.inputs['Strength'].default_value=.31",
        "bg.inputs['Strength'].default_value=.27",
        "overcast sky strength",
    )
    text = replace_once(
        text,
        "sun.data.energy=1.48",
        "sun.data.energy=1.14",
        "soft sun strength",
    )
    text = replace_once(
        text,
        "fill.data.energy=145",
        "fill.data.energy=92",
        "soft fill strength",
    )

    text = replace_once(
        text,
        "(70,-26,1.7),(60,-34,1.4)",
        "(72,-28,1.55),(55,-35,1.35)",
        "stone-face sightline bushes",
    )
    text = replace_once(
        text,
        "(53,42,1.5),(75,11,1.7),(86,-6,1.5)",
        "(53,42,1.5),(82,13,1.45),(86,-6,1.5)",
        "red-approach holdout clearance",
    )
    text = replace_once(
        text,
        "(82,-57,1.55),(72,-59,1.35)",
        "(86,-56,1.45),(86,-62,1.30)",
        "south-path sightline bushes",
    )
    text = replace_once(
        text,
        "(73,-38),(64,-51),(53,-60)",
        "(73,-38),(70,-50),(46,-61)",
        "south-path sightline trees",
    )

    cameras = r'''CAMERA_SPECS=[
    # Fixed matched views, aligned to the route and broadside landmark axes.
    ('Ref_0054_Bronze',(67.3,49.0,1.60),(78.5,49.0,3.28),42),
    ('Ref_0060_WaterGarden',(69.4,43.2,1.58),(55.0,44.0,1.62),39),
    ('Ref_0180_RedGranite',(72.0,14.0,1.52),(63.0,14.0,1.88),40),
    ('Ref_0188_BlackSphere',(67.0,4.0,1.54),(78.0,4.0,1.96),42),
    ('Ref_0194_VendingEntrance',(81.0,-5.5,1.52),(85.2,5.0,1.42),38),
    ('Ref_0274_NWBuildings',(-80.0,31.2,1.58),(-82.0,43.0,1.74),37),
    ('Ref_0342_StoneFace',(69.0,-33.0,1.52),(69.0,-23.0,2.10),40),
    ('Ref_0406_Pavilion',(69.0,-56.0,1.52),(57.0,-47.0,1.62),38),
    ('Ref_0434_BenchPath',(70.0,-67.0,1.52),(70.0,-55.0,1.32),39),
    ('Ref_0448_MapJunction',(78.0,-70.0,1.52),(78.0,-57.0,1.55),40),
    # Holdouts were selected before this final patch and are not used above.
    ('Holdout_0056_EastAvenue',(78.0,51.0,1.58),(58.0,53.0,1.40),36),
    ('Holdout_0176_RedApproach',(76.0,10.0,1.55),(61.0,14.0,1.45),36),
    ('Holdout_0320_ShadedCurve',(73.0,-16.0,1.55),(58.0,-25.0,1.38),36),
    ('Holdout_0388_SouthJunction',(70.0,-51.0,1.55),(54.0,-46.0,1.42),36),
    ('Holdout_0446_MapApproach',(74.0,-69.0,1.55),(78.0,-57.0,1.48),38),
    ('Detail_Bronze',(70.0,49.0,2.15),(78.5,49.0,3.62),52),
    ('Detail_BlackSphere',(70.5,4.0,1.95),(78.0,4.0,1.98),52),
    ('Detail_StoneFace',(69.0,-30.0,1.95),(69.0,-23.0,2.40),52),
    ('Detail_Pavers',(62.0,-57.0,1.10),(72.0,-57.0,.15),45),
    ('Show_Baseball',(35.0,-28.0,4.0),(-20.0,22.0,1.1),36),
    ('Show_EastPlayground',(94.0,26.0,2.0),(75.0,34.0,1.8),35),
    ('Show_EastEntrance',(98.0,-2.0,1.72),(89.0,-3.0,1.35),38),
    ('Show_Aerial',(116.0,-125.0,138.0),(0.0,0.0,0.0),44),
]'''
    text = replace_regex(
        text,
        r"^CAMERA_SPECS=\[.*?^\]",
        cameras,
        "matched and holdout cameras",
    )

    text = text.replace("video-grounded-realistic-v3", "video-grounded-realistic-final")
    target.write_text(text, encoding="utf-8")
    print(f"Final patch applied to {target}: {target.stat().st_size} bytes")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("usage: patch_final.py <build_yatsukusa_realistic.py>")
    main(sys.argv[1])

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
        "MAT['hedge'] = solid_material('MAT_ClippedHedgeFinal', (.032,.118,.026), roughness=.98, noise_scale=34, noise_strength=.48, bump_strength=.58)\nMAT['hedge_light'] = solid_material('MAT_ClippedHedgeLightFinal', (.050,.155,.031), roughness=.98, noise_scale=32, noise_strength=.44, bump_strength=.52)",
        "non-stretched hedge materials",
    )

    text = replace_once(
        text,
        "MAT['face_recess'] = solid_material('MAT_FaceRecess', (.15,.145,.135), roughness=.87, noise_scale=6, noise_strength=.14, bump_strength=.12)",
        """MAT['face_recess'] = solid_material('MAT_FaceRecess', (.105,.100,.092), roughness=.91, noise_scale=6, noise_strength=.18, bump_strength=.15)
MAT['canopy_inner'] = solid_material('MAT_CanopyInterior', (.034,.108,.026), roughness=.99, noise_scale=5.5, noise_strength=.20, bump_strength=.10)
MAT['paver_grime'] = solid_material('MAT_PaverEdgeGrime', (.075,.072,.064), roughness=.99, noise_scale=3.2, noise_strength=.32, bump_strength=.18)
MAT['stone_face_dark'] = solid_material('MAT_StoneFaceDark', (.105,.100,.090), roughness=.94, noise_scale=9.0, noise_strength=.42, bump_strength=.48)
MAT['stone_face_light'] = solid_material('MAT_StoneFaceLight', (.48,.455,.405), roughness=.96, noise_scale=8.0, noise_strength=.30, bump_strength=.38)
MAT['bush_core'] = solid_material('MAT_BushCore', (.036,.132,.028), roughness=.98, noise_scale=27, noise_strength=.46, bump_strength=.55)
MAT['bush_core_light'] = solid_material('MAT_BushCoreLight', (.052,.168,.034), roughness=.98, noise_scale=25, noise_strength=.42, bump_strength=.50)""",
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

    # The previous large green lobes read as low-poly balls. Keep only a small,
    # deeply shadowed core and let several hundred video-derived leaf cards make
    # both the volume and the silhouette.
    centre=Vector((x+lean.x*.62,y+lean.y*.62,height*.76))
    lobe_count=8+rng.randrange(4)
    for li in range(lobe_count):
        a=2*math.pi*li/lobe_count+rng.uniform(-.36,.36)
        radial=crown*rng.uniform(.10,.39)
        p=centre+Vector((math.cos(a)*radial,math.sin(a)*radial,height*rng.uniform(-.10,.11)))
        sx=crown*rng.uniform(.28,.45)
        sy=crown*rng.uniform(.26,.43)
        sz=crown*rng.uniform(.25,.39)
        lobe=ico_sphere(f'{name}_CanopyInner_{li}',tuple(p),(sx,sy,sz),MAT['canopy_inner'],collection,subdivisions=3)
        for vertex in lobe.data.vertices:
            co=vertex.co
            co*=1.0+rng.uniform(-.16,.16)+.045*math.sin(co.x*3.1+co.y*2.3+co.z*4.2)
        for poly in lobe.data.polygons:
            poly.use_smooth=True

    lv=[];lf=[];luv=[]
    cluster_count=max(430,int((500+rng.randrange(90))*leaf_density))
    positions=tips[:]
    while len(positions)<cluster_count:
        a=rng.uniform(0,2*math.pi)
        rad=crown*(rng.random()**.58)*rng.uniform(.45,1.02)
        z=height*rng.uniform(.55,1.02)
        # Flatten the underside and round the upper crown as in the mature
        # avenue trees in the walk-through.
        crown_limit=max(.24,1.0-abs(z-centre.z)/(height*.34))
        rad*=.62+.38*crown_limit
        positions.append(Vector((centre.x+math.cos(a)*rad,centre.y+math.sin(a)*rad,z)))
    for p in positions[:cluster_count]:
        w=crown*rng.uniform(.12,.205);h=w*rng.uniform(.72,1.12)
        rot=rng.uniform(0,math.pi)
        for cross in range(3):
            ang=rot+cross*math.pi/3
            right=Vector((math.cos(ang),math.sin(ang),0))*w*.5
            up=Vector((0,0,h*.5))+Vector((math.cos(ang+math.pi/2),math.sin(ang+math.pi/2),0))*rng.uniform(-.10,.10)*h
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
    material=MAT['bush_core_light' if light else 'bush_core']
    obj=ico_sphere(name,(x,y,radius*.62),(radius*rng.uniform(.92,1.12),radius*rng.uniform(.86,1.08),radius*rng.uniform(.68,.86)),material,'VEGETATION',subdivisions=3)
    for vertex in obj.data.vertices:
        co=vertex.co
        co*=1+rng.uniform(-.075,.075)+.025*math.sin(co.x*5+co.y*4+co.z*6)
    for poly in obj.data.polygons:
        poly.use_smooth=True
    lv=[];lf=[];luv=[]
    for i in range(190):
        az=rng.uniform(0,2*math.pi);el=rng.uniform(-.32,1.10)
        q=Vector((x+math.cos(az)*math.cos(el)*radius*.96,y+math.sin(az)*math.cos(el)*radius*.93,radius*.62+math.sin(el)*radius*.72))
        w=radius*rng.uniform(.055,.10);h=w*rng.uniform(.75,1.18)
        right=Vector((math.cos(az),math.sin(az),0))*w;up=Vector((0,0,h))
        base=len(lv);lv.extend([tuple(q-right-up),tuple(q+right-up),tuple(q+right+up),tuple(q-right+up)])
        lf.append((base,base+1,base+2,base+3));luv.append([(0,0),(1,0),(1,1),(0,1)])
    mesh_object(name+'_LeafShell',lv,lf,MAT[['leaf_a','leaf_b','leaf_c'][seed%3]],'VEGETATION',uvs=luv)
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
    # The source close-up is an elephant-head-like bronze: one rounded crown,
    # two asymmetric drooping sides and a narrow central support. Build it from
    # overlapping smooth volumes rather than a flat ring or stacked boxes.
    body=ico_sphere('BronzeDroop_Crown',(x,y,4.25),(.70,1.18,.72),MAT['bronze'],'SCULPTURES',subdivisions=4)
    for p in body.data.polygons:p.use_smooth=True
    variable_tube('BronzeDroop_Left',[(x,y+.78,4.27),(x,y+1.05,3.92),(x,y+1.02,3.52),(x,y+.84,3.22)],[.43,.38,.27,.15],MAT['bronze'],'SCULPTURES',elliptical=.72,sides=32)
    variable_tube('BronzeDroop_Right',[(x,y-.78,4.25),(x,y-1.05,3.98),(x,y-1.12,3.68),(x,y-.96,3.48)],[.40,.34,.23,.13],MAT['bronze'],'SCULPTURES',elliptical=.70,sides=32)
    variable_tube('BronzeDroop_Support',[(x,y,2.50),(x,y,3.05),(x,y,3.60)],[.32,.24,.16],MAT['bronze'],'SCULPTURES',elliptical=.78,sides=28)
    sphere('BronzeDroop_Undershadow',(x-.64,y,3.78),(.07,.44,.23),MAT['paint_black'],'SCULPTURES',segments=32,rings=16)
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
    # Continuous broadside profile with a high left return, low horizontal body,
    # undercut and right foot.
    profile=[(-2.08,.88),(-2.05,2.80),(-1.72,3.18),(-1.38,2.92),(-1.28,2.22),(.74,2.22),(1.20,2.02),(1.50,1.58),(1.50,.76),(1.12,.64),(.82,.92),(.76,1.28),(-1.06,1.28),(-1.25,.86)]
    verts=[];faces=[];half=.59
    for xx in (-half,half):verts.extend([(x+xx,y+yy,z) for yy,z in profile])
    n=len(profile);faces.append(tuple(range(n)));faces.append(tuple(range(2*n-1,n-1,-1)))
    for i in range(n):j=(i+1)%n;faces.append((i,j,n+j,n+i))
    body=mesh_object('BlackSphere_Body',verts,faces,MAT['paint_black'],'SCULPTURES');add_bevel(body,.19,4)
    sphere('BlackSphere_Orb',(x,y-.72,2.92),(.66,.66,.66),MAT['paint_black'],'SCULPTURES',segments=48,rings=24)
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
    # Frames 171-173 show a dark rounded monolith, closer to an irregular oval
    # than a rectangular slab. A pale, gently bent vertical depression is the
    # identifying feature.
    head=ico_sphere('StoneFace_Head',(x,y,2.24),(1.28,.73,1.48),MAT['stone_face_dark'],'SCULPTURES',subdivisions=4)
    rng=random.Random(3420)
    for v in head.data.vertices:
        v.co*=1.0+rng.uniform(-.055,.055)+.025*math.sin(v.co.x*4.1+v.co.z*3.3)
    for p in head.data.polygons:p.use_smooth=True
    sphere('StoneFace_RecessTop',(x-.09,y-.748,2.62),(.39,.034,.62),MAT['stone_face_light'],'SCULPTURES',segments=40,rings=20)
    sphere('StoneFace_RecessBottom',(x+.09,y-.754,1.84),(.37,.034,.57),MAT['stone_face_light'],'SCULPTURES',segments=40,rings=20)
    sphere('StoneFace_RecessShade',(x+.02,y-.786,2.21),(.16,.016,.65),MAT['stone_face_dark'],'SCULPTURES',segments=36,rings=18)
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
        "('Hedge_South',[(42,-61),(24,-65),(3,-67),(-20,-66)],1.4,1.15),",
        "('Hedge_South',[(42,-61),(24,-65),(3,-67),(-20,-66)],1.4,1.15),\n    ('Hedge_FinalApproach',[(48,-55),(59,-55),(70,-55),(75,-56)],1.42,1.18),",
        "final bench-path hedge",
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
    text = replace_once(
        text,
        "(77,-9),(69,-30),(57,-47)",
        "(77,-9),(65,-31),(57,-47)",
        "stone-face sightline lamp",
    )

    cameras = r'''CAMERA_SPECS=[
    # Fixed matched views, aligned to the route and broadside landmark axes.
    ('Ref_0054_Bronze',(68.0,43.0,1.60),(78.5,49.0,3.38),35),
    ('Ref_0060_WaterGarden',(68.5,39.5,1.58),(55.0,44.0,1.50),34),
    ('Ref_0180_RedGranite',(70.0,7.0,1.52),(63.0,14.0,1.70),36),
    ('Ref_0188_BlackSphere',(70.0,-1.5,1.54),(78.0,4.0,1.82),38),
    ('Ref_0194_VendingEntrance',(80.0,-3.5,1.52),(88.0,5.0,1.35),31),
    ('Ref_0274_NWBuildings',(-97.0,31.0,1.58),(-82.0,43.0,1.55),31),
    ('Ref_0342_StoneFace',(57.0,-35.0,1.52),(72.0,-18.0,1.42),34),
    ('Ref_0406_Pavilion',(72.0,-57.0,1.52),(56.0,-45.0,1.42),34),
    ('Ref_0434_BenchPath',(48.0,-65.0,1.52),(71.0,-57.0,1.22),32),
    ('Ref_0448_MapJunction',(60.0,-67.0,1.52),(79.0,-57.0,1.42),31),
    # Holdouts were selected before this final patch and are not used above.
    ('Holdout_0056_EastAvenue',(78.0,62.5,1.58),(76.0,21.0,1.36),34),
    ('Holdout_0176_RedApproach',(76.0,10.0,1.55),(61.0,14.0,1.45),36),
    ('Holdout_0320_ShadedCurve',(73.0,-16.0,1.55),(58.0,-25.0,1.38),36),
    ('Holdout_0388_SouthJunction',(70.0,-51.0,1.55),(54.0,-46.0,1.42),36),
    ('Holdout_0446_MapApproach',(58.0,-67.0,1.55),(79.0,-57.0,1.40),31),
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

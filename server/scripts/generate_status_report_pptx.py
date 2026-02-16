#!/usr/bin/env python3
"""
Generate a branded PowerPoint status report from project data.
Reads JSON data from stdin, outputs PPTX to the path specified as first argument.
"""

import sys
import json
import os
from datetime import datetime
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE

FONT_DIR = os.path.join(os.path.dirname(__file__), '..', '..', 'client', 'public', 'fonts')
FONT_REGULAR = os.path.join(FONT_DIR, 'AvenirNextLTPro-Regular.ttf')
FONT_BOLD = os.path.join(FONT_DIR, 'AvenirNextLTPro-Bold.ttf')
FONT_DEMI = os.path.join(FONT_DIR, 'AvenirNextLTPro-Demi.ttf')
FONT_LIGHT = os.path.join(FONT_DIR, 'AvenirNextLTPro-Light.ttf')
FONT_NAME = 'Avenir Next LT Pro'

SLIDE_WIDTH = Inches(13.333)
SLIDE_HEIGHT = Inches(7.5)

def hex_to_rgb(hex_str):
    hex_str = hex_str.lstrip('#')
    return RGBColor(int(hex_str[0:2], 16), int(hex_str[2:4], 16), int(hex_str[4:6], 16))

def set_font(run, size=10, bold=False, color=None, name=FONT_NAME):
    run.font.name = name
    run.font.size = Pt(size)
    run.font.bold = bold
    if color:
        run.font.color.rgb = color if isinstance(color, RGBColor) else hex_to_rgb(color)

def add_text(tf, text, size=10, bold=False, color=None, alignment=PP_ALIGN.LEFT, space_before=0, space_after=0, level=0):
    p = tf.add_paragraph() if len(tf.paragraphs) > 0 and tf.paragraphs[0].text != '' else tf.paragraphs[0]
    if len(tf.paragraphs) > 1 or tf.paragraphs[0].text != '':
        p = tf.add_paragraph()
    p.alignment = alignment
    p.level = level
    if space_before:
        p.space_before = Pt(space_before)
    if space_after:
        p.space_after = Pt(space_after)
    run = p.add_run()
    run.text = text
    set_font(run, size=size, bold=bold, color=color)
    return p

def set_cell_text(cell, text, size=9, bold=False, color=None, bg_color=None, alignment=PP_ALIGN.LEFT, valign=MSO_ANCHOR.MIDDLE):
    cell.text = ""
    tf = cell.text_frame
    tf.word_wrap = True
    tf.auto_size = None
    p = tf.paragraphs[0]
    p.alignment = alignment
    run = p.add_run()
    run.text = str(text)
    set_font(run, size=size, bold=bold, color=color)
    cell.vertical_anchor = valign
    if bg_color:
        cell.fill.solid()
        cell.fill.fore_color.rgb = bg_color if isinstance(bg_color, RGBColor) else hex_to_rgb(bg_color)

def add_multi_text_cell(cell, lines, size=8, color=None, bg_color=None, valign=MSO_ANCHOR.TOP):
    cell.text = ""
    tf = cell.text_frame
    tf.word_wrap = True
    tf.auto_size = None
    cell.vertical_anchor = valign
    if bg_color:
        cell.fill.solid()
        cell.fill.fore_color.rgb = bg_color if isinstance(bg_color, RGBColor) else hex_to_rgb(bg_color)
    for i, line in enumerate(lines):
        if i == 0:
            p = tf.paragraphs[0]
        else:
            p = tf.add_paragraph()
        text = line.get('text', '') if isinstance(line, dict) else str(line)
        bold = line.get('bold', False) if isinstance(line, dict) else False
        line_size = line.get('size', size) if isinstance(line, dict) else size
        line_color = line.get('color', color) if isinstance(line, dict) else color
        p.alignment = PP_ALIGN.LEFT
        p.space_before = Pt(1)
        p.space_after = Pt(1)
        run = p.add_run()
        run.text = text
        set_font(run, size=line_size, bold=bold, color=line_color)

def add_accent_bar(slide, primary_color, left=0, top=0, width=None, height=Inches(0.08)):
    if width is None:
        width = SLIDE_WIDTH
    shape = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, left, top, width, height)
    shape.fill.solid()
    shape.fill.fore_color.rgb = hex_to_rgb(primary_color)
    shape.line.fill.background()
    return shape

def create_title_slide(prs, data, primary_color, secondary_color):
    slide = prs.slides.add_slide(prs.slide_layouts[6])

    bg_shape = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, SLIDE_WIDTH, SLIDE_HEIGHT)
    bg_shape.fill.solid()
    bg_shape.fill.fore_color.rgb = hex_to_rgb(primary_color)
    bg_shape.line.fill.background()

    accent = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, Inches(5.0), SLIDE_WIDTH, Inches(0.06))
    accent.fill.solid()
    accent.fill.fore_color.rgb = hex_to_rgb(secondary_color)
    accent.line.fill.background()

    txBox = slide.shapes.add_textbox(Inches(1), Inches(2.5), Inches(11), Inches(1.5))
    tf = txBox.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.LEFT
    run = p.add_run()
    run.text = "STATUS REPORT"
    set_font(run, size=40, bold=True, color=RGBColor(255, 255, 255))

    txBox2 = slide.shapes.add_textbox(Inches(1), Inches(4.2), Inches(8), Inches(0.8))
    tf2 = txBox2.text_frame
    tf2.word_wrap = True
    p = tf2.paragraphs[0]
    run = p.add_run()
    run.text = data.get('clientName', '')
    set_font(run, size=16, bold=True, color=RGBColor(255, 255, 255))
    p2 = tf2.add_paragraph()
    run2 = p2.add_run()
    run2.text = data.get('reportDate', datetime.now().strftime('%B %d, %Y'))
    set_font(run2, size=14, color=RGBColor(230, 230, 230))

    logo_path = data.get('logoPath')
    if logo_path and os.path.exists(logo_path):
        try:
            slide.shapes.add_picture(logo_path, Inches(10.5), Inches(4.0), height=Inches(0.8))
        except Exception:
            pass

    return slide

def create_dashboard_slide(prs, data, primary_color, secondary_color):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    add_accent_bar(slide, primary_color, top=0)

    txBox = slide.shapes.add_textbox(Inches(0.5), Inches(0.2), Inches(8), Inches(0.5))
    tf = txBox.text_frame
    p = tf.paragraphs[0]
    run = p.add_run()
    run.text = data.get('projectName', 'Project Status')
    set_font(run, size=20, bold=True, color=primary_color)

    info_table = slide.shapes.add_table(4, 2, Inches(0.4), Inches(0.8), Inches(4), Inches(1.3)).table
    info_table.columns[0].width = Inches(1.5)
    info_table.columns[1].width = Inches(2.5)
    for row in info_table.rows:
        row.height = Inches(0.3)

    labels = ['Project Name', 'Project Manager', 'Status Date', 'Status']
    values = [
        data.get('projectName', ''),
        data.get('pmName', ''),
        data.get('reportDate', ''),
        data.get('projectStatus', 'Active').upper(),
    ]
    for i, (label, value) in enumerate(zip(labels, values)):
        set_cell_text(info_table.cell(i, 0), label, size=9, bold=True, bg_color=primary_color, color=RGBColor(255, 255, 255))
        set_cell_text(info_table.cell(i, 1), value, size=9)

    summary_box = slide.shapes.add_textbox(Inches(4.8), Inches(0.8), Inches(8), Inches(1.3))
    tf = summary_box.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    run = p.add_run()
    run.text = "Project Summary"
    set_font(run, size=12, bold=True, color=primary_color)
    p2 = tf.add_paragraph()
    run2 = p2.add_run()
    run2.text = data.get('projectDescription', 'No project description available.')
    set_font(run2, size=9)

    accomplished = data.get('accomplished', [])
    upcoming = data.get('upcoming', [])

    cols_table = slide.shapes.add_table(2, 2, Inches(0.4), Inches(2.3), Inches(12.4), Inches(4.8)).table
    cols_table.columns[0].width = Inches(6.2)
    cols_table.columns[1].width = Inches(6.2)
    cols_table.rows[0].height = Inches(0.4)
    cols_table.rows[1].height = Inches(4.4)

    set_cell_text(cols_table.cell(0, 0), 'Accomplished This Period', size=11, bold=True, bg_color=primary_color, color=RGBColor(255, 255, 255))
    set_cell_text(cols_table.cell(0, 1), 'Upcoming Activities', size=11, bold=True, bg_color=secondary_color, color=RGBColor(255, 255, 255))

    acc_lines = []
    for item in accomplished:
        acc_lines.append({'text': f"• {item}", 'size': 9})
    if not acc_lines:
        acc_lines = [{'text': 'No activities recorded for this period.', 'size': 9, 'color': '#666666'}]
    add_multi_text_cell(cols_table.cell(1, 0), acc_lines, size=9)

    up_lines = []
    for item in upcoming:
        up_lines.append({'text': f"• {item}", 'size': 9})
    if not up_lines:
        up_lines = [{'text': 'No upcoming activities planned.', 'size': 9, 'color': '#666666'}]
    add_multi_text_cell(cols_table.cell(1, 1), up_lines, size=9)

    return slide

def create_executive_summary_slide(prs, data, primary_color, secondary_color):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    add_accent_bar(slide, primary_color, top=0)

    txBox = slide.shapes.add_textbox(Inches(0.8), Inches(0.3), Inches(10), Inches(0.6))
    tf = txBox.text_frame
    p = tf.paragraphs[0]
    run = p.add_run()
    run.text = "Executive Summary"
    set_font(run, size=24, bold=True, color=primary_color)

    content_box = slide.shapes.add_textbox(Inches(0.8), Inches(1.2), Inches(11.5), Inches(5.8))
    tf = content_box.text_frame
    tf.word_wrap = True

    summary_text = data.get('executiveSummary', '')
    if summary_text:
        lines = summary_text.split('\n')
        for i, line in enumerate(lines):
            line = line.strip()
            if not line:
                continue
            if i == 0:
                p = tf.paragraphs[0]
            else:
                p = tf.add_paragraph()
            p.space_after = Pt(4)
            
            if line.startswith('- ') or line.startswith('• '):
                line = line[2:]
                run = p.add_run()
                run.text = f"• {line}"
                set_font(run, size=11)
            else:
                run = p.add_run()
                run.text = line
                set_font(run, size=11, bold=line.endswith(':'))

    milestones = data.get('milestonePosture', {})
    if milestones:
        p = tf.add_paragraph()
        p.space_before = Pt(12)
        run = p.add_run()
        run.text = "Milestone Posture:"
        set_font(run, size=11, bold=True, color=primary_color)

        for status_label, items in milestones.items():
            if items:
                p = tf.add_paragraph()
                run = p.add_run()
                run.text = f"• {status_label}: {', '.join(items)}"
                set_font(run, size=10)

    return slide

def create_timeline_slide(prs, data, primary_color, secondary_color):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    add_accent_bar(slide, primary_color, top=0)

    txBox = slide.shapes.add_textbox(Inches(0.8), Inches(0.3), Inches(10), Inches(0.6))
    tf = txBox.text_frame
    p = tf.paragraphs[0]
    run = p.add_run()
    run.text = "Timeline & Milestones"
    set_font(run, size=24, bold=True, color=primary_color)

    milestones = data.get('milestones', [])
    if not milestones:
        note_box = slide.shapes.add_textbox(Inches(1), Inches(2), Inches(10), Inches(1))
        tf = note_box.text_frame
        p = tf.paragraphs[0]
        run = p.add_run()
        run.text = "No milestones defined for this project."
        set_font(run, size=12, color='#666666')
        return slide

    num_rows = min(len(milestones) + 1, 16)
    table = slide.shapes.add_table(num_rows, 5, Inches(0.4), Inches(1.1), Inches(12.4), Inches(0.35 * num_rows)).table
    table.columns[0].width = Inches(4.0)
    table.columns[1].width = Inches(2.0)
    table.columns[2].width = Inches(2.0)
    table.columns[3].width = Inches(2.2)
    table.columns[4].width = Inches(2.2)

    headers = ['Milestone', 'Target Date', 'Status', 'Start Date', 'End Date']
    for i, header in enumerate(headers):
        set_cell_text(table.cell(0, i), header, size=9, bold=True, bg_color=primary_color, color=RGBColor(255, 255, 255))

    for row_idx, ms in enumerate(milestones[:15]):
        r = row_idx + 1
        set_cell_text(table.cell(r, 0), ms.get('name', ''), size=9)
        set_cell_text(table.cell(r, 1), ms.get('targetDate', ''), size=9)

        status = ms.get('status', '')
        status_color = None
        if status == 'completed':
            status_color = '#22c55e'
        elif status == 'in-progress':
            status_color = '#3b82f6'
        elif status == 'not-started':
            status_color = '#9ca3af'
        set_cell_text(table.cell(r, 2), status.replace('-', ' ').title(), size=9, color=status_color)
        set_cell_text(table.cell(r, 3), ms.get('startDate', ''), size=9)
        set_cell_text(table.cell(r, 4), ms.get('endDate', ''), size=9)

    return slide

def create_deliverables_slide(prs, data, primary_color, secondary_color):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    add_accent_bar(slide, primary_color, top=0)

    txBox = slide.shapes.add_textbox(Inches(0.8), Inches(0.3), Inches(10), Inches(0.6))
    tf = txBox.text_frame
    p = tf.paragraphs[0]
    run = p.add_run()
    run.text = "Deliverables Tracker"
    set_font(run, size=24, bold=True, color=primary_color)

    note_box = slide.shapes.add_textbox(Inches(0.8), Inches(1.3), Inches(11), Inches(1))
    tf = note_box.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    run = p.add_run()
    run.text = "Deliverables tracking is a planned feature. This slide will be populated automatically once the deliverables tracker is configured for this project."
    set_font(run, size=12, color='#888888')

    hint_box = slide.shapes.add_textbox(Inches(0.8), Inches(2.5), Inches(11), Inches(3))
    tf = hint_box.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    run = p.add_run()
    run.text = "Planned columns: Document | Status | Approval Required | Handoff | Work Product/Deliverable"
    set_font(run, size=10, color='#aaaaaa')

    shape = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.8), Inches(3.5), Inches(11.5), Inches(0.04))
    shape.fill.solid()
    shape.fill.fore_color.rgb = hex_to_rgb(secondary_color)
    shape.line.fill.background()

    return slide

def create_raidd_slide(prs, data, primary_color, secondary_color):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    add_accent_bar(slide, primary_color, top=0)

    txBox = slide.shapes.add_textbox(Inches(0.8), Inches(0.3), Inches(10), Inches(0.6))
    tf = txBox.text_frame
    p = tf.paragraphs[0]
    run = p.add_run()
    run.text = "RAIDD Log"
    set_font(run, size=24, bold=True, color=primary_color)

    raidd = data.get('raidd', {})
    content_box = slide.shapes.add_textbox(Inches(0.5), Inches(1.1), Inches(12.2), Inches(3.2))
    tf = content_box.text_frame
    tf.word_wrap = True

    sections = [
        ('Risks', raidd.get('risks', []), 'active, monitored'),
        ('Issues', raidd.get('issues', []), 'tracked'),
        ('Action Items', raidd.get('actionItems', []), 'open'),
        ('Decisions', raidd.get('decisions', []), 'recorded'),
        ('Dependencies', raidd.get('dependencies', []), 'tracked'),
    ]

    first = True
    for section_name, entries, qualifier in sections:
        active_entries = [e for e in entries if e.get('status', '') in ('open', 'in_progress')]
        if not active_entries and not entries:
            continue

        if first:
            p = tf.paragraphs[0]
            first = False
        else:
            p = tf.add_paragraph()
            p.space_before = Pt(8)

        run = p.add_run()
        run.text = f"{section_name} ({qualifier})"
        set_font(run, size=11, bold=True, color=primary_color)

        display_entries = active_entries if active_entries else entries
        if not display_entries:
            p = tf.add_paragraph()
            run = p.add_run()
            run.text = f"- None at this time."
            set_font(run, size=9, color='#666666')
        else:
            for entry in display_entries[:8]:
                p = tf.add_paragraph()
                p.space_before = Pt(2)
                ref = entry.get('refNumber', '')
                title = entry.get('title', '')
                priority = entry.get('priority', '')
                priority_tag = f" [{priority.upper()}]" if priority else ''
                run = p.add_run()
                run.text = f"- {ref}: {title}{priority_tag}"
                set_font(run, size=9)

                mitigation = entry.get('mitigationPlan', '')
                if mitigation:
                    p2 = tf.add_paragraph()
                    run2 = p2.add_run()
                    run2.text = f"  Mitigation: {mitigation}"
                    set_font(run2, size=8, color='#555555')

    raidd_table_entries = raidd.get('tableEntries', [])
    if raidd_table_entries:
        num_rows = min(len(raidd_table_entries) + 1, 8)
        table = slide.shapes.add_table(num_rows, 5, Inches(0.4), Inches(4.5), Inches(12.2), Inches(0.3 * num_rows)).table
        table.columns[0].width = Inches(4.0)
        table.columns[1].width = Inches(1.5)
        table.columns[2].width = Inches(2.0)
        table.columns[3].width = Inches(2.0)
        table.columns[4].width = Inches(2.7)

        headers = ['Risks/Issue Description', 'Status', 'Owner', 'Due Date', 'Mitigation']
        for i, h in enumerate(headers):
            set_cell_text(table.cell(0, i), h, size=8, bold=True, bg_color=primary_color, color=RGBColor(255, 255, 255))

        for row_idx, entry in enumerate(raidd_table_entries[:7]):
            r = row_idx + 1
            set_cell_text(table.cell(r, 0), f"{entry.get('refNumber', '')} {entry.get('title', '')}", size=8)
            set_cell_text(table.cell(r, 1), entry.get('status', ''), size=8)
            set_cell_text(table.cell(r, 2), entry.get('ownerName', ''), size=8)
            set_cell_text(table.cell(r, 3), entry.get('dueDate', ''), size=8)
            set_cell_text(table.cell(r, 4), entry.get('mitigationPlan', ''), size=8)

    return slide

def generate_pptx(data, output_path):
    primary_color = data.get('primaryColor', '#810FFB')
    secondary_color = data.get('secondaryColor', '#E60CB3')

    prs = Presentation()
    prs.slide_width = SLIDE_WIDTH
    prs.slide_height = SLIDE_HEIGHT

    create_title_slide(prs, data, primary_color, secondary_color)
    create_dashboard_slide(prs, data, primary_color, secondary_color)
    create_executive_summary_slide(prs, data, primary_color, secondary_color)
    create_timeline_slide(prs, data, primary_color, secondary_color)
    create_deliverables_slide(prs, data, primary_color, secondary_color)
    create_raidd_slide(prs, data, primary_color, secondary_color)

    prs.save(output_path)
    return output_path

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: generate_status_report_pptx.py <output_path>", file=sys.stderr)
        sys.exit(1)

    output_path = sys.argv[1]
    input_data = json.load(sys.stdin)
    result = generate_pptx(input_data, output_path)
    print(json.dumps({"success": True, "path": result}))
